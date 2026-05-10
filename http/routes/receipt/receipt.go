package receipt

import (
	"context"
	"pennywise/ai"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/log"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ReceiptService struct{}

func NewReceiptService() *ReceiptService {
	return &ReceiptService{}
}

func (s *ReceiptService) ScanReceipt(ctx context.Context, r *apiv1.ScanReceiptRequest) (*apiv1.ScanReceiptResponse, error) {
	logger := log.FromContext(ctx)

	processed, err := ai.ProcessImage(r.ImageData)
	if err != nil {
		logger.Error("failed to process image", "error", err)
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	logger.Info("scanning receipt",
		"originalSize", len(r.ImageData),
		"processedSize", len(processed.Data),
		"width", processed.Width,
		"height", processed.Height)

	scanResult, err := ai.AnalyzeReceipt(ctx, processed)
	if err != nil {
		logger.Error("failed to scan receipt", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	items := make([]*apiv1.ReceiptItem, 0, len(scanResult.Items))
	for _, scannedItem := range scanResult.Items {
		qty := scannedItem.Qty
		if qty < 1 {
			qty = 1
		}
		items = append(items, &apiv1.ReceiptItem{
			Name:       scannedItem.Name,
			Price:      scannedItem.Price,
			Qty:        qty,
			Confidence: scannedItem.Confidence,
		})
	}

	return &apiv1.ScanReceiptResponse{
		Receipt: &apiv1.ReceiptData{
			MerchantName: scanResult.Merchant,
			Currency:     scanResult.Currency,
			Date:         timestamppb.New(scanResult.Date),
			Total:        scanResult.Total,
			Items:        items,
		},
	}, nil
}
