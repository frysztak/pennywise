package group

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"

	"pennywise/db/database"
	"pennywise/db/overrides"
	"pennywise/log"
	"pennywise/storage"

	"github.com/lucasb-eyer/go-colorful"
)

// setDefaultGroupImage stores a deterministic gradient SVG as the group's image.
// Failures are logged but not fatal — the frontend falls back to initials.
func SetDefaultGroupImage(ctx context.Context, db *database.Queries, groupID, groupName string) {
	logger := log.FromContext(ctx)

	svg := generateDefaultGroupImage(groupName)
	if err := storage.Blobs.SaveGroupImage(groupID, storage.SizeLarge, svg, true); err != nil {
		logger.Error("failed to save default group image", "error", err, "group_id", groupID)
		return
	}

	now := overrides.NullTextTime{Time: time.Now(), Valid: true}
	if err := db.UpdateGroupImage(ctx, database.UpdateGroupImageParams{
		ID:             groupID,
		ImageUpdatedAt: now,
	}); err != nil {
		logger.Error("failed to update default group image timestamp", "error", err, "group_id", groupID)
	}
}

// generateDefaultGroupImage returns an SVG linear gradient seeded by `seed`.
// Ported from privjs/gradients: two LCH endpoints (the second derived via HSL
// hue-rotate + lighten), interpolated in LCH across 5–19 stops, with stop
// offsets eased through a cubic bezier preset.
func generateDefaultGroupImage(seed string) []byte {
	r := newSeededRNG(seed)

	numStops := r.intRange(5, 20)
	lVal := float64(r.intRange(55, 75)) / 100
	cVal := float64(r.intRange(50, 100)) / 100
	hVal := float64(r.intRange(0, 360))
	hueAdj := float64(r.intRange(35, 155))

	color1 := colorful.Hcl(hVal, cVal, lVal)

	h1, s1, l1 := color1.Hsl()
	h2 := math.Mod(h1+hueAdj, 360)
	if h2 < 0 {
		h2 += 360
	}
	color2 := colorful.Hsl(h2, s1, math.Min(1, l1+0.1))

	c1H, c1C, c1L := color1.Hcl()
	c2H, c2C, c2L := color2.Hcl()

	curve := curvePresets[r.intRange(0, len(curvePresets)-1)]
	angle := r.intRange(0, 360)

	// Bezier control points are remapped from the design-time curve definition:
	// (x1,y1) = (1-cp1.y, cp1.x), (x2,y2) = (1-cp2.y, cp2.x).
	bx1, by1 := 1-curve.p1y, curve.p1x
	bx2, by2 := 1-curve.p2y, curve.p2x

	var stops strings.Builder
	prevOffset := 0
	for i := range numStops {
		t := float64(i) / float64(numStops-1)

		col := colorful.Hcl(
			lerpHue(c1H, c2H, t),
			lerp(c1C, c2C, t),
			lerp(c1L, c2L, t),
		).Clamped()

		y := bezierYForX(t, bx1, by1, bx2, by2)
		offset := max(int(math.Round(math.Max(0, math.Min(1, y))*100)), prevOffset)
		prevOffset = offset

		fmt.Fprintf(&stops, `<stop offset="%d%%" stop-color="%s"/>`, offset, col.Hex())
	}

	svg := fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1067" preserveAspectRatio="xMidYMid slice">`+
			`<defs><linearGradient id="g" gradientTransform="rotate(%d, 0.5, 0.5)">%s</linearGradient></defs>`+
			`<rect width="1600" height="1067" fill="url(#g)"/>`+
			`</svg>`,
		angle, stops.String(),
	)
	return []byte(svg)
}

type bezierCurve struct {
	p1x, p1y, p2x, p2y float64
}

var curvePresets = []bezierCurve{
	{p1x: 0.25, p1y: 0.75, p2x: 0.75, p2y: 0.25},
	{p1x: 0.333, p1y: 1, p2x: 0.666, p2y: 0},
	{p1x: 1.1, p1y: 1, p2x: -0.1, p2y: 0},
}

// seededRNG is a SplitMix64 PRNG seeded from SHA-256 of a string. Diverges
// from the JS source's seedrandom(seed)() pattern, which constructs a fresh
// PRNG per draw and so produces the same value for every call with the same
// seed — almost certainly a bug. Advancing state matches the intent.
type seededRNG struct {
	state uint64
}

func newSeededRNG(seed string) *seededRNG {
	sum := sha256.Sum256([]byte(seed))
	s := binary.BigEndian.Uint64(sum[:8])
	if s == 0 {
		s = 1
	}
	return &seededRNG{state: s}
}

func (r *seededRNG) next() float64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	z = z ^ (z >> 31)
	return float64(z>>11) / float64(uint64(1)<<53)
}

// intRange returns an int in [lo, hi) — matches the source's seededRandom.
func (r *seededRNG) intRange(lo, hi int) int {
	return int(math.Floor(r.next()*float64(hi-lo))) + lo
}

func lerp(a, b, t float64) float64 { return a + (b-a)*t }

func lerpHue(h1, h2, t float64) float64 {
	d := h2 - h1
	switch {
	case d > 180:
		d -= 360
	case d < -180:
		d += 360
	}
	h := math.Mod(h1+d*t, 360)
	if h < 0 {
		h += 360
	}
	return h
}

// bezierYForX returns the y of the cubic bezier with endpoints (0,0)/(1,1)
// and control points (x1,y1)/(x2,y2) at the given x. Binary-searches on t,
// mirroring privjs/gradients' getYValueForBezier.
func bezierYForX(xTarget, x1, y1, x2, y2 float64) float64 {
	const tol = 0.0001
	lo, hi := 0.0, 1.0
	t := 0.5
	for range 60 {
		mt := 1 - t
		x := 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t
		if math.Abs(x-xTarget) < tol {
			break
		}
		if xTarget > x {
			lo = t
		} else {
			hi = t
		}
		t = (lo + hi) / 2
	}
	mt := 1 - t
	return 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t
}
