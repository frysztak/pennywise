package overrides

import (
	"database/sql/driver"
	"fmt"
	"time"
)

type NullTextTime struct {
	Time  time.Time
	Valid bool
}

func (nut *NullTextTime) Scan(src interface{}) error {
	if src == nil {
		nut.Time = time.Time{}
		nut.Valid = false
		return nil
	}

	switch v := src.(type) {
	case string:
		time, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return err
		}
		nut.Time = time
		nut.Valid = true
	default:
		return fmt.Errorf("unsupported type for NullTextTime: %T, expected string", src)
	}
	return nil
}

func (nut NullTextTime) Value() (driver.Value, error) {
	if !nut.Valid {
		return nil, nil
	}
	return nut.Time.Format(time.RFC3339), nil
}

func (nut NullTextTime) IsZero() bool {
	return !nut.Valid || nut.Time.IsZero()
}
