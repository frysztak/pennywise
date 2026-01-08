# AI-Based Receipt OCR Implementation Plan

## Overview

Add AI-powered receipt scanning to automatically extract line items and convert them into expenses. Users can upload receipt images, review extracted items, and create single or multiple expenses from the data.

---

## Feature Requirements

1. **Upload receipt image** (JPG, PNG, WebP)
2. **AI extracts structured data**: merchant, date, line items, totals
3. **User reviews and selects items** to include
4. **User chooses expense mode**:
   - Single expense with total amount
   - Multiple expenses (one per selected item)
5. **Support multiple AI providers**: OpenAI, Anthropic, Ollama (local)
6. **Configurable via environment variables**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend                                                     │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────┐ │
│  │ File Upload     │ → │ Item Selection  │ → │ Submit      │ │
│  │ (raw image)     │   │ (checkboxes)    │   │ (one call)  │ │
│  └─────────────────┘   └─────────────────┘   └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
          │ ScanReceipt                              │ CreateExpensesFromReceipt
          ▼                                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend (Go)                                                 │
│  ┌──────────────────────────┐  ┌───────────────────────────┐ │
│  │ ScanReceipt              │  │ CreateExpensesFromReceipt │ │
│  │  1. Validate/resize      │  │  1. Validate selection    │ │
│  │  2. Call AI provider     │  │  2. Create expenses (tx)  │ │
│  │  3. Parse JSON           │  │  3. Return created IDs    │ │
│  │  4. Return ReceiptData   │  │                           │ │
│  └──────────────────────────┘  └───────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## API Design

### Two Endpoints

**1. ScanReceipt** - Analyze receipt image
- Input: base64 image
- Output: ReceiptData with items
- No side effects (read-only)

**2. CreateExpensesFromReceipt** - Create expenses from scanned data
- Input: group ID, receipt data, selected item IDs, mode (single/multiple)
- Output: created expense IDs
- Atomic transaction - all or nothing

This keeps scanning separate from expense creation, allowing users to scan without committing.

---

## Image Handling

### Server-Side Processing (Go)

All image processing on backend:
- Frontend sends raw base64 image
- Backend validates, resizes, compresses
- Then sends to AI provider

### Go Image Processing (`ai/image.go`)

```go
package ai

import (
    "bytes"
    "encoding/base64"
    "fmt"
    "image"
    "image/jpeg"
    _ "image/png"
    _ "golang.org/x/image/webp"

    "golang.org/x/image/draw"
)

const (
    MaxInputSize = 10 * 1024 * 1024 // 10MB
    MaxDimension = 1536
    JPEGQuality  = 85
)

type ProcessedImage struct {
    Base64Data string
    MediaType  string
    Width      int
    Height     int
}

func ProcessImage(base64Data, mediaType string) (*ProcessedImage, error) {
    data, err := base64.StdEncoding.DecodeString(base64Data)
    if err != nil {
        return nil, fmt.Errorf("invalid base64: %w", err)
    }

    if len(data) > MaxInputSize {
        return nil, fmt.Errorf("image too large: %d bytes (max %d)", len(data), MaxInputSize)
    }

    img, _, err := image.Decode(bytes.NewReader(data))
    if err != nil {
        return nil, fmt.Errorf("failed to decode: %w", err)
    }

    bounds := img.Bounds()
    w, h := bounds.Dx(), bounds.Dy()

    if w > MaxDimension || h > MaxDimension {
        ratio := float64(MaxDimension) / float64(max(w, h))
        w, h = int(float64(w)*ratio), int(float64(h)*ratio)
        dst := image.NewRGBA(image.Rect(0, 0, w, h))
        draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
        img = dst
    }

    var buf bytes.Buffer
    if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: JPEGQuality}); err != nil {
        return nil, fmt.Errorf("failed to encode: %w", err)
    }

    return &ProcessedImage{
        Base64Data: base64.StdEncoding.EncodeToString(buf.Bytes()),
        MediaType:  "image/jpeg",
        Width:      w,
        Height:     h,
    }, nil
}
```

---

## Backend Implementation

### 1. Configuration (`config/config.go`)

```go
type Configuration struct {
    // ... existing fields ...

    AIProvider string // "openai", "anthropic", "ollama", "openrouter", ""
    AIAPIKey   string
    AIBaseURL  string
    AIModel    string
}
```

**Environment Variables:**
```bash
AI_PROVIDER=openai         # openai | anthropic | ollama | openrouter
AI_API_KEY=sk-...          # API key (not needed for Ollama)
AI_BASE_URL=               # Override base URL
AI_MODEL=gpt-4o            # Model to use
```

### 2. AI Provider Interface (`ai/provider.go`)

```go
package ai

import (
    "context"
    "fmt"
    "pennywise/config"
)

type ImageMessage struct {
    Base64Data string
    MediaType  string
}

type Provider interface {
    AnalyzeImage(ctx context.Context, image ImageMessage, prompt string) (string, error)
}

func NewProvider(cfg *config.Configuration) (Provider, error) {
    switch cfg.AIProvider {
    case "openai":
        return NewOpenAIProvider(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel)
    case "anthropic":
        return NewAnthropicProvider(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel)
    case "ollama":
        return NewOllamaProvider(cfg.AIBaseURL, cfg.AIModel)
    case "openrouter":
        return NewOpenRouterProvider(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel)
    case "":
        return nil, fmt.Errorf("AI_PROVIDER not configured")
    default:
        return nil, fmt.Errorf("unknown AI provider: %s", cfg.AIProvider)
    }
}
```

### 3. OpenAI Provider (`ai/openai.go`)

```go
package ai

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type OpenAIProvider struct {
    apiKey, baseURL, model string
    client                 *http.Client
}

func NewOpenAIProvider(apiKey, baseURL, model string) (*OpenAIProvider, error) {
    if apiKey == "" {
        return nil, fmt.Errorf("API key required")
    }
    if baseURL == "" {
        baseURL = "https://api.openai.com/v1"
    }
    if model == "" {
        model = "gpt-4o"
    }
    return &OpenAIProvider{
        apiKey:  apiKey,
        baseURL: baseURL,
        model:   model,
        client:  &http.Client{Timeout: 90 * time.Second},
    }, nil
}

func (p *OpenAIProvider) AnalyzeImage(ctx context.Context, img ImageMessage, prompt string) (string, error) {
    body, _ := json.Marshal(map[string]any{
        "model": p.model,
        "messages": []map[string]any{{
            "role": "user",
            "content": []map[string]any{
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": map[string]string{
                    "url":    fmt.Sprintf("data:%s;base64,%s", img.MediaType, img.Base64Data),
                    "detail": "high",
                }},
            },
        }},
        "max_tokens": 4096,
    })

    req, _ := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+p.apiKey)
    req.Header.Set("Content-Type", "application/json")

    resp, err := p.client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    var result struct {
        Choices []struct{ Message struct{ Content string } } `json:"choices"`
        Error   struct{ Message string }                     `json:"error"`
    }
    json.NewDecoder(resp.Body).Decode(&result)

    if result.Error.Message != "" {
        return "", fmt.Errorf("API error: %s", result.Error.Message)
    }
    if len(result.Choices) == 0 {
        return "", fmt.Errorf("no response")
    }
    return result.Choices[0].Message.Content, nil
}
```

### 4. Ollama Provider (`ai/ollama.go`)

```go
package ai

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type OllamaProvider struct {
    baseURL, model string
    client         *http.Client
}

func NewOllamaProvider(baseURL, model string) (*OllamaProvider, error) {
    if baseURL == "" {
        baseURL = "http://localhost:11434"
    }
    if model == "" {
        model = "llava:7b"
    }
    return &OllamaProvider{
        baseURL: baseURL,
        model:   model,
        client:  &http.Client{Timeout: 180 * time.Second},
    }, nil
}

func (p *OllamaProvider) AnalyzeImage(ctx context.Context, img ImageMessage, prompt string) (string, error) {
    body, _ := json.Marshal(map[string]any{
        "model":  p.model,
        "prompt": prompt,
        "images": []string{img.Base64Data},
        "stream": false,
    })

    req, _ := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/generate", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")

    resp, err := p.client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    var result struct {
        Response string `json:"response"`
        Error    string `json:"error"`
    }
    json.NewDecoder(resp.Body).Decode(&result)

    if result.Error != "" {
        return "", fmt.Errorf("Ollama error: %s", result.Error)
    }
    return result.Response, nil
}
```

### 5. OCR Prompt (`ai/prompts.go`)

```go
package ai

const ReceiptOCRPrompt = `Analyze this receipt and extract data as JSON.

Return ONLY valid JSON, no markdown or explanations.

Schema:
{
  "merchant_name": "string",
  "date": "YYYY-MM-DD or null",
  "currency": "USD",
  "items": [
    {
      "name": "string",
      "quantity": 1,
      "unit_price": 0.00,
      "total_price": 0.00,
      "category": "food|beverage|grocery|household|service|other"
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tip": 0.00,
  "total": 0.00,
  "confidence": 0.0-1.0
}

Rules:
1. Extract ALL visible line items
2. Use null for unreadable fields
3. Detect currency from symbols ($ € £), default USD
4. confidence = image quality / extraction certainty
5. Include modifiers in item name ("Latte - Large")
6. Prices as positive numbers, 2 decimal places

JSON only:`
```

### 6. Protobuf (`proto/api/v1/receipt.proto`)

```protobuf
syntax = "proto3";

package pennywise.api.v1;

import "buf/validate/validate.proto";
import "google/protobuf/timestamp.proto";

option go_package = "pennywise/gen/api/v1;apiv1";

service ReceiptService {
  // Scan receipt image and extract data
  rpc ScanReceipt(ScanReceiptRequest) returns (ScanReceiptResponse);

  // Create expenses from scanned receipt
  rpc CreateExpensesFromReceipt(CreateExpensesFromReceiptRequest) returns (CreateExpensesFromReceiptResponse);
}

message ScanReceiptRequest {
  string image_data = 1 [(buf.validate.field).string = {min_len: 100, max_len: 14000000}];
  string media_type = 2 [(buf.validate.field).string = {in: ["image/jpeg", "image/png", "image/webp"]}];
}

message ScanReceiptResponse {
  ReceiptData receipt = 1;
}

message ReceiptData {
  string merchant_name = 1;
  google.protobuf.Timestamp date = 2;
  string currency = 3;
  repeated ReceiptItem items = 4;
  double subtotal = 5;
  double tax = 6;
  double tip = 7;
  double total = 8;
  double confidence = 9;
}

message ReceiptItem {
  string id = 1;
  string name = 2;
  double quantity = 3;
  double unit_price = 4;
  double total_price = 5;
  string category = 6;
}

// Create expenses from receipt
message CreateExpensesFromReceiptRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];

  // The scanned receipt data
  ReceiptData receipt = 2 [(buf.validate.field).required = true];

  // Which item IDs to include
  repeated string selected_item_ids = 3 [(buf.validate.field).repeated.min_items = 1];

  // How to create expenses
  ExpenseMode mode = 4;
}

enum ExpenseMode {
  EXPENSE_MODE_UNSPECIFIED = 0;
  EXPENSE_MODE_SINGLE = 1;      // One expense with sum of selected items
  EXPENSE_MODE_MULTIPLE = 2;    // One expense per selected item
}

message CreateExpensesFromReceiptResponse {
  // IDs of created expenses
  repeated string expense_ids = 1;
}
```

### 7. Receipt Handler (`http/routes/receipt/receipt.go`)

```go
package receipt

import (
    "context"
    "encoding/json"
    "fmt"
    "strings"
    "time"

    "connectrpc.com/connect"
    "github.com/google/uuid"
    "google.golang.org/protobuf/types/known/timestamppb"

    "pennywise/ai"
    "pennywise/config"
    "pennywise/db"
    "pennywise/db/database"
    v1 "pennywise/gen/api/v1"
    "pennywise/http/helpers"
    "pennywise/log"
)

type Service struct {
    provider ai.Provider
}

func NewService() (*Service, error) {
    provider, err := ai.NewProvider(config.Config)
    if err != nil {
        return nil, err
    }
    return &Service{provider: provider}, nil
}

func (s *Service) ScanReceipt(
    ctx context.Context,
    req *connect.Request[v1.ScanReceiptRequest],
) (*connect.Response[v1.ScanReceiptResponse], error) {
    logger := log.FromContext(ctx)

    // Process image
    processed, err := ai.ProcessImage(req.Msg.ImageData, req.Msg.MediaType)
    if err != nil {
        return nil, connect.NewError(connect.CodeInvalidArgument, err)
    }

    logger.Info("scanning receipt", "size", len(processed.Base64Data)*3/4)

    // Call AI
    response, err := s.provider.AnalyzeImage(ctx, ai.ImageMessage{
        Base64Data: processed.Base64Data,
        MediaType:  processed.MediaType,
    }, ai.ReceiptOCRPrompt)
    if err != nil {
        logger.Error("AI failed", "error", err)
        return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("analysis failed"))
    }

    // Parse
    receipt, err := parseReceiptJSON(response)
    if err != nil {
        logger.Error("parse failed", "error", err)
        return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("parse failed"))
    }

    // Add IDs
    for i := range receipt.Items {
        receipt.Items[i].Id = uuid.New().String()
    }

    return connect.NewResponse(&v1.ScanReceiptResponse{Receipt: receipt}), nil
}

func (s *Service) CreateExpensesFromReceipt(
    ctx context.Context,
    req *connect.Request[v1.CreateExpensesFromReceiptRequest],
) (*connect.Response[v1.CreateExpensesFromReceiptResponse], error) {
    logger := log.FromContext(ctx)
    userID, err := helpers.GetSessionInfo(ctx)
    if err != nil {
        return nil, connect.NewError(connect.CodeUnauthenticated, err)
    }

    receipt := req.Msg.Receipt
    selectedIDs := make(map[string]bool)
    for _, id := range req.Msg.SelectedItemIds {
        selectedIDs[id] = true
    }

    // Filter selected items
    var selectedItems []*v1.ReceiptItem
    for _, item := range receipt.Items {
        if selectedIDs[item.Id] {
            selectedItems = append(selectedItems, item)
        }
    }

    if len(selectedItems) == 0 {
        return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("no valid items selected"))
    }

    // Verify user is group member
    _, err = db.ReadQueries.GetGroupMember(ctx, database.GetGroupMemberParams{
        GroupID: req.Msg.GroupId,
        UserID:  userID,
    })
    if err != nil {
        return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("not a group member"))
    }

    // Get expense date
    var expenseDate time.Time
    if receipt.Date != nil {
        expenseDate = receipt.Date.AsTime()
    } else {
        expenseDate = time.Now()
    }

    currency := receipt.Currency
    if currency == "" {
        currency = "USD"
    }

    // Create expenses in transaction
    tx, err := db.WriteDB.BeginTx(ctx, nil)
    if err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }
    defer tx.Rollback()
    qtx := db.WriteQueries.WithTx(tx)

    var expenseIDs []string

    switch req.Msg.Mode {
    case v1.ExpenseMode_EXPENSE_MODE_SINGLE, v1.ExpenseMode_EXPENSE_MODE_UNSPECIFIED:
        // Single expense with total
        var total float64
        var names []string
        for _, item := range selectedItems {
            total += item.TotalPrice
            names = append(names, item.Name)
        }

        name := receipt.MerchantName
        if name == "" {
            name = "Receipt"
        }

        expense, err := qtx.CreateExpense(ctx, database.CreateExpenseParams{
            ID:          uuid.New().String(),
            GroupID:     req.Msg.GroupId,
            PayerID:     userID,
            Amount:      int64(total * 100),
            Currency:    currency,
            Name:        name,
            Description: strings.Join(names, ", "),
            Date:        expenseDate,
        })
        if err != nil {
            return nil, connect.NewError(connect.CodeInternal, err)
        }
        expenseIDs = append(expenseIDs, expense.ID)

    case v1.ExpenseMode_EXPENSE_MODE_MULTIPLE:
        // One expense per item
        prefix := receipt.MerchantName
        if prefix != "" {
            prefix += ": "
        }

        for _, item := range selectedItems {
            expense, err := qtx.CreateExpense(ctx, database.CreateExpenseParams{
                ID:       uuid.New().String(),
                GroupID:  req.Msg.GroupId,
                PayerID:  userID,
                Amount:   int64(item.TotalPrice * 100),
                Currency: currency,
                Name:     prefix + item.Name,
                Date:     expenseDate,
            })
            if err != nil {
                return nil, connect.NewError(connect.CodeInternal, err)
            }
            expenseIDs = append(expenseIDs, expense.ID)
        }
    }

    if err := tx.Commit(); err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }

    logger.Info("created expenses from receipt",
        "count", len(expenseIDs),
        "mode", req.Msg.Mode.String())

    return connect.NewResponse(&v1.CreateExpensesFromReceiptResponse{
        ExpenseIds: expenseIDs,
    }), nil
}

func parseReceiptJSON(response string) (*v1.ReceiptData, error) {
    response = strings.TrimSpace(response)
    response = strings.TrimPrefix(response, "```json")
    response = strings.TrimPrefix(response, "```")
    response = strings.TrimSuffix(response, "```")
    response = strings.TrimSpace(response)

    var data struct {
        MerchantName string  `json:"merchant_name"`
        Date         *string `json:"date"`
        Currency     string  `json:"currency"`
        Items        []struct {
            Name       string  `json:"name"`
            Quantity   float64 `json:"quantity"`
            UnitPrice  float64 `json:"unit_price"`
            TotalPrice float64 `json:"total_price"`
            Category   string  `json:"category"`
        } `json:"items"`
        Subtotal   float64 `json:"subtotal"`
        Tax        float64 `json:"tax"`
        Tip        float64 `json:"tip"`
        Total      float64 `json:"total"`
        Confidence float64 `json:"confidence"`
    }

    if err := json.Unmarshal([]byte(response), &data); err != nil {
        return nil, err
    }

    receipt := &v1.ReceiptData{
        MerchantName: data.MerchantName,
        Currency:     data.Currency,
        Subtotal:     data.Subtotal,
        Tax:          data.Tax,
        Tip:          data.Tip,
        Total:        data.Total,
        Confidence:   data.Confidence,
    }

    if data.Date != nil && *data.Date != "" {
        if t, err := time.Parse("2006-01-02", *data.Date); err == nil {
            receipt.Date = timestamppb.New(t)
        }
    }

    for _, item := range data.Items {
        qty := item.Quantity
        if qty == 0 {
            qty = 1
        }
        receipt.Items = append(receipt.Items, &v1.ReceiptItem{
            Name:       item.Name,
            Quantity:   qty,
            UnitPrice:  item.UnitPrice,
            TotalPrice: item.TotalPrice,
            Category:   item.Category,
        })
    }

    return receipt, nil
}
```

---

## Frontend Implementation

### Receipt Scanner Modal (`web/src/components/receipt/receipt-scanner-modal.tsx`)

```tsx
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@connectrpc/connect-query";
import { ReceiptService } from "@/gen/api/v1/receipt_pb";
import { ExpenseMode } from "@/gen/api/v1/receipt_pb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Receipt, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { ReceiptData } from "@/gen/api/v1/receipt_pb";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
}

type Mode = "single" | "multiple";

export function ReceiptScannerModal({ open, onOpenChange, groupId }: Props) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("single");

  const queryClient = useQueryClient();
  const client = useClient(ReceiptService);

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return client.scanReceipt({
        imageData: base64,
        mediaType: file.type,
      });
    },
    onSuccess: (res) => {
      setReceipt(res.receipt!);
      setSelected(new Set(res.receipt!.items.map((i) => i.id)));
      setStep("review");
    },
    onError: (err) => {
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  // Create expenses mutation
  const createMutation = useMutation({
    mutationFn: () => {
      if (!receipt) throw new Error("No receipt");
      return client.createExpensesFromReceipt({
        groupId,
        receipt,
        selectedItemIds: Array.from(selected),
        mode: mode === "single" ? ExpenseMode.SINGLE : ExpenseMode.MULTIPLE,
      });
    },
    onSuccess: (res) => {
      const count = res.expenseIds.length;
      toast.success(`Created ${count} expense${count > 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["GetGroupActivity"] });
      queryClient.invalidateQueries({ queryKey: ["GetUserGroups"] });
      onOpenChange(false);
      reset();
    },
    onError: (err) => {
      toast.error(`Failed to create expenses: ${err.message}`);
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && scanMutation.mutate(files[0]),
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedItems = receipt?.items.filter((i) => selected.has(i.id)) ?? [];
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.totalPrice, 0);

  const reset = () => {
    setStep("upload");
    setReceipt(null);
    setSelected(new Set());
    setMode("single");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" ? "Scan Receipt" : "Review Items"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
              ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
              ${scanMutation.isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <input {...getInputProps()} />
            {scanMutation.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <p>Analyzing receipt...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop receipt image here</p>
                <p className="text-sm text-muted-foreground">JPG, PNG, WebP (max 10MB)</p>
              </div>
            )}
          </div>
        )}

        {step === "review" && receipt && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex gap-3 p-3 bg-muted rounded-lg">
              <Receipt className="h-8 w-8 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium">{receipt.merchantName || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">
                  {receipt.date && new Date(receipt.date.toDate()).toLocaleDateString()}
                  {receipt.date && " • "}
                  {receipt.currency} {receipt.total.toFixed(2)}
                </p>
              </div>
            </div>

            {receipt.confidence < 0.7 && (
              <div className="flex gap-2 text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Low confidence - please verify
              </div>
            )}

            {/* Items */}
            <div>
              <div className="flex justify-between mb-2">
                <Label>Items</Label>
                <div className="text-sm space-x-2">
                  <button className="text-primary hover:underline" onClick={() => setSelected(new Set(receipt.items.map(i => i.id)))}>All</button>
                  <button className="text-primary hover:underline" onClick={() => setSelected(new Set())}>None</button>
                </div>
              </div>
              <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
                {receipt.items.length === 0 ? (
                  <p className="p-3 text-center text-muted-foreground">No items found</p>
                ) : receipt.items.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-muted-foreground">
                      {item.quantity > 1 && `${item.quantity}× `}
                      {receipt.currency} {item.totalPrice.toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Mode */}
            {selected.size > 0 && (
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-2">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="single" />
                  <div>
                    <p className="font-medium">Single expense</p>
                    <p className="text-sm text-muted-foreground">{receipt.currency} {selectedTotal.toFixed(2)}</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="multiple" />
                  <div>
                    <p className="font-medium">Separate expenses</p>
                    <p className="text-sm text-muted-foreground">{selected.size} items</p>
                  </div>
                </label>
              </RadioGroup>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-3 border-t">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Scan another
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={selected.size === 0 || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create {mode === "single" ? "expense" : `${selected.size} expenses`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

### Integration with Group Page

```tsx
// In group page
import { ReceiptScannerModal } from "@/components/receipt/receipt-scanner-modal";
import { Camera } from "lucide-react";

const [receiptOpen, setReceiptOpen] = useState(false);

// Button in header
<Button variant="outline" onClick={() => setReceiptOpen(true)}>
  <Camera className="h-4 w-4 mr-2" />
  Scan Receipt
</Button>

// Modal
<ReceiptScannerModal
  open={receiptOpen}
  onOpenChange={setReceiptOpen}
  groupId={groupId}
/>
```

---

## Local OCR Models (6GB GPU)

Vision models for Ollama that fit in 6GB VRAM:

| Model | VRAM | Speed | Quality | Command |
|-------|------|-------|---------|---------|
| **llava:7b** | ~4.5GB | Fast | Good | `ollama pull llava:7b` |
| **llava:13b-q4** | ~5.5GB | Medium | Better | `ollama pull llava:13b-q4_K_M` |
| **moondream** | ~2GB | Very Fast | OK | `ollama pull moondream` |
| **bakllava** | ~4.5GB | Fast | Good | `ollama pull bakllava` |
| **llava-phi3** | ~3GB | Fast | Good | `ollama pull llava-phi3` |

**Recommended**: `llava:7b` - best balance for 6GB GPU.

**Setup:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llava:7b

# .env
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=llava:7b
```

---

## Files Summary

### New Files
```
ai/
  provider.go       # Interface + factory
  openai.go         # OpenAI provider
  anthropic.go      # Anthropic provider
  ollama.go         # Ollama provider
  openrouter.go     # OpenRouter provider
  prompts.go        # OCR prompt
  image.go          # Image resize/compress

http/routes/receipt/
  receipt.go        # Handlers

proto/api/v1/
  receipt.proto     # API definitions

web/src/components/receipt/
  receipt-scanner-modal.tsx
```

### Modified Files
```
config/config.go                # AI config
http/router/routes.go           # Register service
go.mod                          # golang.org/x/image
web/package.json                # react-dropzone
web/src/routes/.../group/$groupId.tsx
```

---

## Implementation Order

1. **PR 1: AI Infrastructure**
   - Config fields
   - `ai/` package with providers + image processing

2. **PR 2: Receipt API**
   - Proto file, run `just gen`
   - Both handlers (scan + create)
   - Register route

3. **PR 3: Frontend**
   - Install react-dropzone
   - Modal component
   - Group page integration
