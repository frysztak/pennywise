package storage

import (
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"time"

	"github.com/spf13/afero"
)

type ImageSize string

const (
	SizeLarge ImageSize = "large"
	SizeSmall ImageSize = "small"
)

// Blobs is the global blob storage instance, initialized by Init.
var Blobs *BlobStorage

type BlobStorage struct {
	fs   afero.Fs
	base string
}

// ImageFile holds the raw bytes, MIME type, and modification time of a stored image.
type ImageFile struct {
	Data        []byte
	ContentType string
	Mtime       time.Time
}

func Init(basePath string) error {
	return InitWithFs(afero.NewOsFs(), basePath)
}

func InitWithFs(afs afero.Fs, basePath string) error {
	dirs := []string{
		filepath.Join(basePath, "images", "groups"),
		filepath.Join(basePath, "images", "avatars"),
	}
	for _, d := range dirs {
		if err := afs.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("create storage dir %s: %w", d, err)
		}
	}
	Blobs = &BlobStorage{fs: afs, base: basePath}
	return nil
}

// --- group images ---

func (s *BlobStorage) groupSVGPath(groupID string) string {
	return filepath.Join(s.base, "images", "groups", groupID+".svg")
}

func (s *BlobStorage) groupJPEGPath(groupID string, size ImageSize) string {
	return filepath.Join(s.base, "images", "groups", fmt.Sprintf("%s_%s.jpg", groupID, size))
}

// SaveGroupImage writes a group image. For SVG (isSVG=true) the size parameter
// is ignored and a single .svg file is stored. For JPEG, one file per size is written.
func (s *BlobStorage) SaveGroupImage(groupID string, size ImageSize, data []byte, isSVG bool) error {
	path := s.groupJPEGPath(groupID, size)
	if isSVG {
		path = s.groupSVGPath(groupID)
	}
	return afero.WriteFile(s.fs, path, data, 0644)
}

// LoadGroupImage returns the group image for the requested size.
// SVG is preferred: if a .svg file exists it is served for any requested size.
func (s *BlobStorage) LoadGroupImage(groupID string, size ImageSize) (*ImageFile, error) {
	if fi, err := s.fs.Stat(s.groupSVGPath(groupID)); err == nil {
		data, err := afero.ReadFile(s.fs, s.groupSVGPath(groupID))
		if err != nil {
			return nil, err
		}
		return &ImageFile{Data: data, ContentType: "image/svg+xml", Mtime: fi.ModTime()}, nil
	}

	p := s.groupJPEGPath(groupID, size)
	fi, err := s.fs.Stat(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fs.ErrNotExist
		}
		return nil, err
	}
	data, err := afero.ReadFile(s.fs, p)
	if err != nil {
		return nil, err
	}
	return &ImageFile{Data: data, ContentType: "image/jpeg", Mtime: fi.ModTime()}, nil
}

// DeleteGroupImages removes all stored variants (SVG + all JPEG sizes) for a group.
func (s *BlobStorage) DeleteGroupImages(groupID string) error {
	paths := []string{
		s.groupSVGPath(groupID),
		s.groupJPEGPath(groupID, SizeLarge),
		s.groupJPEGPath(groupID, SizeSmall),
	}
	for _, p := range paths {
		if err := s.fs.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("remove %s: %w", p, err)
		}
	}
	return nil
}

// --- user avatars ---

func (s *BlobStorage) avatarSVGPath(userID string) string {
	return filepath.Join(s.base, "images", "avatars", userID+".svg")
}

func (s *BlobStorage) avatarJPEGPath(userID string) string {
	return filepath.Join(s.base, "images", "avatars", userID+".jpg")
}

// SaveAvatar stores an avatar, removing the alternate format if one existed.
func (s *BlobStorage) SaveAvatar(userID string, data []byte, isSVG bool) error {
	if isSVG {
		_ = s.fs.Remove(s.avatarJPEGPath(userID))
		return afero.WriteFile(s.fs, s.avatarSVGPath(userID), data, 0644)
	}
	_ = s.fs.Remove(s.avatarSVGPath(userID))
	return afero.WriteFile(s.fs, s.avatarJPEGPath(userID), data, 0644)
}

// LoadAvatar returns the stored avatar. SVG is preferred over JPEG.
func (s *BlobStorage) LoadAvatar(userID string) (*ImageFile, error) {
	if fi, err := s.fs.Stat(s.avatarSVGPath(userID)); err == nil {
		data, err := afero.ReadFile(s.fs, s.avatarSVGPath(userID))
		if err != nil {
			return nil, err
		}
		return &ImageFile{Data: data, ContentType: "image/svg+xml", Mtime: fi.ModTime()}, nil
	}

	p := s.avatarJPEGPath(userID)
	fi, err := s.fs.Stat(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fs.ErrNotExist
		}
		return nil, err
	}
	data, err := afero.ReadFile(s.fs, p)
	if err != nil {
		return nil, err
	}
	return &ImageFile{Data: data, ContentType: "image/jpeg", Mtime: fi.ModTime()}, nil
}
