package ai

import (
	"encoding/json"
	"time"

	"github.com/invopop/jsonschema"
)

type ReceiptItem struct {
	Name       string  `json:"name" jsonschema_description:"Name of the good purchased"`
	Price      float64 `json:"price" jsonschema_description:"Total price for this line (unit price * qty)"`
	Qty        int32   `json:"qty" jsonschema_description:"Quantity purchased; default 1 if not specified on the receipt"`
	Confidence float64 `json:"confidence" jsonschema_description:"How confident you are in your reading, between 0 and 1"`
}

type Receipt struct {
	Merchant string `json:"merchant" jsonschema_description:"Name of seller or store"`
	Date     time.Time     `json:"date" jsonschema:"format=date-time" jsonschema_description:"Date purchase was made"`
	Currency string        `json:"currency" jsonschema_description:"Currency in which purchase was made"`
	Total    float64       `json:"total" jsonschema_description:"Final price on the receipt"`
	Items    []ReceiptItem `json:"items"`
}

func GenerateSchema[T any]() map[string]interface{} {
	// Structured Outputs uses a subset of JSON schema
	// These flags are necessary to comply with the subset
	reflector := jsonschema.Reflector{
		AllowAdditionalProperties: false,
		DoNotReference:            true,
	}
	var v T
	schema := reflector.Reflect(v)
	schemaJson, err := schema.MarshalJSON()
	if err != nil {
		panic(err)
	}

	var schemaObj map[string]interface{}
	err = json.Unmarshal(schemaJson, &schemaObj)
	if err != nil {
		panic(err)
	}

	return schemaObj
}

// Generate the JSON schema at initialization time
var ReceiptSchema = GenerateSchema[Receipt]()
