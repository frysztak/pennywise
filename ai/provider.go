package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"pennywise/config"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/responses"
)

func AnalyzeReceipt(ctx context.Context, image *ProcessedImage) (*Receipt, error) {
	client := openai.NewClient()

	file, err := client.Files.New(ctx, openai.FileNewParams{
		File:    openai.File(bytes.NewReader(image.Data), "receipt.jpg", image.MediaType),
		Purpose: openai.FilePurposeVision,
	})

	if err != nil {
		return nil, err
	}

	resp, err := client.Responses.New(ctx, responses.ResponseNewParams{
		Input: responses.ResponseNewParamsInputUnion{OfInputItemList: responses.ResponseInputParam{
			responses.ResponseInputItemParamOfMessage(
				responses.ResponseInputMessageContentListParam{
					responses.ResponseInputContentUnionParam{
						OfInputFile: &responses.ResponseInputFileParam{
							FileID: openai.String(file.ID),
							Type:   "input_image",
						},
					},
					responses.ResponseInputContentUnionParam{
						OfInputText: &responses.ResponseInputTextParam{
							Text: ReceiptOCRPrompt,
							Type: "input_text",
						},
					},
				},
				"user",
			),
		}},
		Text: responses.ResponseTextConfigParam{
			Format: responses.ResponseFormatTextConfigUnionParam{
				OfJSONSchema: &responses.ResponseFormatTextJSONSchemaConfigParam{
					Name:        "Receipt",
					Schema:      ReceiptSchema,
					Strict:      openai.Bool(true),
					Description: openai.String("JSON Schema receipt OCR results"),
					Type:        "json_schema",
				},
			},
		},
		Model: config.Config.OpenAIOCRModel,
	})

	if err != nil {
		return nil, err
	}

	var receiptData Receipt
	err = json.Unmarshal([]byte(resp.OutputText()), &receiptData)
	if err != nil {
		return nil, err
	}

	return &receiptData, nil
}
