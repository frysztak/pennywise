package ai

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	MaxInputSize = 10 * 1024 * 1024
	MaxDimension = 1536
	JPEGQuality  = 85
)

type ProcessedImage struct {
	Data      []byte
	MediaType string
	Width     int
	Height    int
}

func ProcessImage(data []byte) (*ProcessedImage, error) {
	if len(data) > MaxInputSize {
		return nil, fmt.Errorf("image too large: %d bytes (max %d)", len(data), MaxInputSize)
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to decode image: %w", err)
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
		return nil, fmt.Errorf("failed to encode image: %w", err)
	}

	return &ProcessedImage{
		Data:      buf.Bytes(),
		MediaType: "image/jpeg",
		Width:     w,
		Height:    h,
	}, nil
}
