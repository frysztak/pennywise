package group

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
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

	group, err := db.ReadQueries.GetGroupById(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group for default image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	setDefaultGroupImage(ctx, r.GroupId, group.Name)

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
