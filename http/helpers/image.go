package helpers

import (
	"bytes"
	"fmt"
	"image"
	"net/http"
	"strconv"

	"pennywise/storage"

	"github.com/kolesa-team/go-webp/encoder"
	"github.com/kolesa-team/go-webp/webp"
	"golang.org/x/image/draw"
)

// ServeImage writes a storage.ImageFile to the response with ETag and cache headers.
func ServeImage(w http.ResponseWriter, r *http.Request, img *storage.ImageFile) {
	etag := `"` + strconv.FormatInt(img.Mtime.Unix(), 10) + `"`
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", img.ContentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("ETag", etag)
	w.Write(img.Data)
}

// EncodeSize scales src to fit within (w, h) preserving aspect ratio, and encodes it as WebP.
func EncodeSize(src image.Image, w, h, quality int) ([]byte, error) {
	srcBounds := src.Bounds()
	targetW, targetH := fitCover(srcBounds.Dx(), srcBounds.Dy(), w, h)
	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, srcBounds, draw.Over, nil)
	opts, err := encoder.NewLossyEncoderOptions(encoder.PresetDefault, float32(quality))
	if err != nil {
		return nil, fmt.Errorf("webp encoder options: %w", err)
	}
	var buf bytes.Buffer
	if err := webp.Encode(&buf, dst, opts); err != nil {
		return nil, fmt.Errorf("encode webp: %w", err)
	}
	return buf.Bytes(), nil
}

func fitCover(w, h, maxW, maxH int) (int, int) {
	if w <= 0 || h <= 0 {
		return maxW, maxH
	}
	rw := float64(maxW) / float64(w)
	rh := float64(maxH) / float64(h)
	r := rw
	if rh < r {
		r = rh
	}
	if r >= 1 {
		return w, h
	}
	return int(float64(w) * r), int(float64(h) * r)
}
