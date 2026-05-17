package group

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"math"
	"net/http"
	"time"

	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"

	"connectrpc.com/connect"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	groupImageMaxWidth   = 1600
	groupImageMaxHeight  = 1067
	groupImageJPEGQual   = 80
	groupImageMaxBytesIn = 16 * 1024 * 1024 // 16MB cap on raw upload
)

// processGroupImage decodes an uploaded image, resizes it to cover groupImageMaxWidth x groupImageMaxHeight,
// and re-encodes as JPEG.
func processGroupImage(data []byte) ([]byte, error) {
	if len(data) > groupImageMaxBytesIn {
		return nil, fmt.Errorf("image too large: %d bytes (max %d)", len(data), groupImageMaxBytesIn)
	}

	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}

	srcBounds := src.Bounds()
	srcW := srcBounds.Dx()
	srcH := srcBounds.Dy()

	targetW, targetH := fitCover(srcW, srcH, groupImageMaxWidth, groupImageMaxHeight)
	if targetW >= srcW && targetH >= srcH {
		targetW, targetH = srcW, srcH
	}

	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, srcBounds, draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: groupImageJPEGQual}); err != nil {
		return nil, fmt.Errorf("encode jpeg: %w", err)
	}
	return buf.Bytes(), nil
}

// generateDefaultGroupImage returns an SVG with a deterministic 3-stop linear gradient
// seeded by `seed`. Stored verbatim as the group's image so the gradient survives renames
// and is served as a normal image asset.
func generateDefaultGroupImage(seed string) []byte {
	sum := sha256.Sum256([]byte(seed))
	hue := float64(binary.BigEndian.Uint16(sum[0:2])) * 360.0 / 65535.0
	angle := float64(binary.BigEndian.Uint16(sum[2:4])) * 360.0 / 65535.0

	c1 := hslToHex(math.Mod(hue, 360), 0.55, 0.36)
	c2 := hslToHex(math.Mod(hue+24, 360), 0.50, 0.28)
	c3 := hslToHex(math.Mod(hue+48, 360), 0.45, 0.20)

	svg := fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1067" preserveAspectRatio="xMidYMid slice">`+
			`<defs><linearGradient id="g" gradientTransform="rotate(%.1f, 0.5, 0.5)">`+
			`<stop offset="0%%" stop-color="%s"/>`+
			`<stop offset="55%%" stop-color="%s"/>`+
			`<stop offset="100%%" stop-color="%s"/>`+
			`</linearGradient></defs>`+
			`<rect width="1600" height="1067" fill="url(#g)"/>`+
			`</svg>`,
		angle, c1, c2, c3,
	)
	return []byte(svg)
}

func hslToHex(h, s, l float64) string {
	c := (1 - math.Abs(2*l-1)) * s
	x := c * (1 - math.Abs(math.Mod(h/60.0, 2)-1))
	m := l - c/2
	var r, g, b float64
	switch {
	case h < 60:
		r, g, b = c, x, 0
	case h < 120:
		r, g, b = x, c, 0
	case h < 180:
		r, g, b = 0, c, x
	case h < 240:
		r, g, b = 0, x, c
	case h < 300:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}
	return fmt.Sprintf("#%02x%02x%02x", int((r+m)*255), int((g+m)*255), int((b+m)*255))
}

// fitCover scales (w,h) so it fits inside (maxW,maxH) preserving aspect ratio.
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

// setDefaultGroupImage stores a deterministic gradient SVG as the group's image.
// Failures are logged but not fatal — the frontend falls back to initials.
func setDefaultGroupImage(ctx context.Context, groupID string) {
	logger := log.FromContext(ctx)

	svg := generateDefaultGroupImage(groupID)
	mime := "image/svg+xml"
	now := overrides.NullTextTime{Time: time.Now(), Valid: true}
	if err := db.WriteQueries.UpdateGroupImage(ctx, database.UpdateGroupImageParams{
		ID:             groupID,
		ImageData:      svg,
		ImageMimeType:  &mime,
		ImageUpdatedAt: now,
	}); err != nil {
		logger.Error("failed to set default group image", "error", err, "group_id", groupID)
	}
}

func (s *GroupService) UploadGroupImage(ctx context.Context, r *apiv1.UploadGroupImageRequest) (*apiv1.UploadGroupImageResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	member, err := db.ReadQueries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  session.UserID,
		GroupID: r.GroupId,
	})
	if err != nil {
		logger.Error("failed to check group membership", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if !member {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("not a group member"))
	}

	processed, err := processGroupImage(r.ImageData)
	if err != nil {
		logger.Warn("failed to process group image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	mime := "image/jpeg"
	now := overrides.NullTextTime{Time: time.Now(), Valid: true}
	if err := db.WriteQueries.UpdateGroupImage(ctx, database.UpdateGroupImageParams{
		ID:             r.GroupId,
		ImageData:      processed,
		ImageMimeType:  &mime,
		ImageUpdatedAt: now,
	}); err != nil {
		logger.Error("failed to save group image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("group image uploaded", "group_id", r.GroupId, "size", len(processed))

	return &apiv1.UploadGroupImageResponse{
		ImageUpdatedAt: timestamppb.New(now.Time),
	}, nil
}

func (s *GroupService) DeleteGroupImage(ctx context.Context, r *apiv1.DeleteGroupImageRequest) (*emptypb.Empty, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	member, err := db.ReadQueries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  session.UserID,
		GroupID: r.GroupId,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if !member {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("not a group member"))
	}

	setDefaultGroupImage(ctx, r.GroupId)

	logger.Info("group image reset to default", "group_id", r.GroupId)
	return &emptypb.Empty{}, nil
}

// HandleGroupImage serves group images from the database.
func HandleGroupImage(w http.ResponseWriter, r *http.Request) {
	logger := log.Logger()

	groupID := r.PathValue("groupId")
	if groupID == "" {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	img, err := db.ReadQueries.GetGroupImage(r.Context(), groupID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Image not found", http.StatusNotFound)
		} else {
			logger.Error("failed to fetch group image", "error", err, "groupId", groupID)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	if len(img.ImageData) == 0 {
		http.Error(w, "Image not found", http.StatusNotFound)
		return
	}

	if img.ImageMimeType != nil && *img.ImageMimeType != "" {
		w.Header().Set("Content-Type", *img.ImageMimeType)
	} else {
		w.Header().Set("Content-Type", "image/jpeg")
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	w.Write(img.ImageData)
}
