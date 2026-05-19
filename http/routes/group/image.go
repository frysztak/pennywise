package group

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io/fs"
	"net/http"
	"time"

	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"pennywise/storage"

	"connectrpc.com/connect"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	groupImageLargeW     = 1600
	groupImageLargeH     = 1067
	groupImageSmallW     = 800
	groupImageSmallH     = 534
	groupImageJPEGQual   = 70
	groupImageMaxBytesIn = 16 * 1024 * 1024 // 16MB cap on raw upload
)

type processedImages struct {
	large []byte
	small []byte
}

// processGroupImage decodes a raster image, produces large and small JPEG variants.
func processGroupImage(data []byte) (*processedImages, error) {
	if len(data) > groupImageMaxBytesIn {
		return nil, fmt.Errorf("image too large: %d bytes (max %d)", len(data), groupImageMaxBytesIn)
	}

	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}

	encodeSize := func(w, h int) ([]byte, error) {
		srcBounds := src.Bounds()
		targetW, targetH := fitCover(srcBounds.Dx(), srcBounds.Dy(), w, h)
		dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
		draw.CatmullRom.Scale(dst, dst.Bounds(), src, srcBounds, draw.Over, nil)
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: groupImageJPEGQual}); err != nil {
			return nil, fmt.Errorf("encode jpeg: %w", err)
		}
		return buf.Bytes(), nil
	}

	large, err := encodeSize(groupImageLargeW, groupImageLargeH)
	if err != nil {
		return nil, err
	}
	small, err := encodeSize(groupImageSmallW, groupImageSmallH)
	if err != nil {
		return nil, err
	}
	return &processedImages{large: large, small: small}, nil
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

	// Remove any existing images (including old SVG default) before writing new ones.
	if err := storage.Blobs.DeleteGroupImages(r.GroupId); err != nil {
		logger.Warn("failed to delete old group images", "error", err, "group_id", r.GroupId)
	}

	processed, err := processGroupImage(r.ImageData)
	if err != nil {
		logger.Warn("failed to process group image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := storage.Blobs.SaveGroupImage(r.GroupId, storage.SizeLarge, processed.large, false); err != nil {
		logger.Error("failed to save large group image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if err := storage.Blobs.SaveGroupImage(r.GroupId, storage.SizeSmall, processed.small, false); err != nil {
		logger.Error("failed to save small group image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	now := overrides.NullTextTime{Time: time.Now(), Valid: true}
	if err := db.WriteQueries.UpdateGroupImage(ctx, database.UpdateGroupImageParams{
		ID:             r.GroupId,
		ImageUpdatedAt: now,
	}); err != nil {
		logger.Error("failed to update group image timestamp", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("group image uploaded", "group_id", r.GroupId,
		"large_bytes", len(processed.large), "small_bytes", len(processed.small))

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

	if err := storage.Blobs.DeleteGroupImages(r.GroupId); err != nil {
		logger.Warn("failed to delete group images from storage", "error", err, "group_id", r.GroupId)
	}

	group, err := db.ReadQueries.GetGroupById(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group for default image", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	SetDefaultGroupImage(ctx, db.WriteQueries, r.GroupId, group.Name)

	logger.Info("group image reset to default", "group_id", r.GroupId)
	return &emptypb.Empty{}, nil
}

// HandleGroupImage serves group images from filesystem blob storage.
// Accepts an optional ?size=small query parameter; defaults to large.
func HandleGroupImage(w http.ResponseWriter, r *http.Request) {
	logger := log.Logger()

	groupID := r.PathValue("groupId")
	if groupID == "" {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	size := storage.SizeLarge
	if r.URL.Query().Get("size") == string(storage.SizeSmall) {
		size = storage.SizeSmall
	}

	img, err := storage.Blobs.LoadGroupImage(groupID, size)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			http.Error(w, "Image not found", http.StatusNotFound)
		} else {
			logger.Error("failed to load group image", "error", err, "groupId", groupID)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	helpers.ServeImage(w, r, img)
}
