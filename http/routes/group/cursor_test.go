package group

import (
	"encoding/base64"
	"testing"
)

func TestActivityCursorRoundTrip(t *testing.T) {
	original := activityCursor{
		Date:      "2026-05-14T12:00:00Z",
		CreatedAt: "2026-05-14T12:34:56Z",
		ID:        "abc-123",
	}

	encoded := encodeActivityCursor(original)
	if encoded == "" {
		t.Fatal("expected non-empty encoded cursor")
	}

	decoded, err := decodeActivityCursor(encoded)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}

	if decoded != original {
		t.Errorf("round-trip mismatch:\nwant: %+v\ngot:  %+v", original, decoded)
	}
}

func TestActivityCursorMalformedBase64(t *testing.T) {
	_, err := decodeActivityCursor("not!valid!base64!@#$")
	if err == nil {
		t.Error("expected error decoding malformed base64")
	}
}

func TestActivityCursorMalformedJSON(t *testing.T) {
	// Valid base64, invalid JSON payload
	encoded := base64.StdEncoding.EncodeToString([]byte("{not json"))
	_, err := decodeActivityCursor(encoded)
	if err == nil {
		t.Error("expected error decoding malformed JSON")
	}
}

func TestActivityCursorEmptyDecodes(t *testing.T) {
	// Empty base64 decodes to empty bytes, which is malformed JSON
	_, err := decodeActivityCursor("")
	if err == nil {
		t.Error("expected error decoding empty cursor")
	}
}
