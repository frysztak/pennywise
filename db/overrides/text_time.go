package overrides

import (
	"database/sql/driver"
	"fmt"
	"time"
)

type TextTime struct {
	time.Time
}

func (ut *TextTime) Scan(src interface{}) error {
	if src == nil {
		ut.Time = time.Time{}
		return nil
	}

	switch v := src.(type) {
	case string:
		time, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return err
		}
		ut.Time = time
	default:
		return fmt.Errorf("unsupported type for TextTime: %T, expected string", src)
	}
	return nil
}

func (ut TextTime) Value() (driver.Value, error) {
	return ut.Format(time.RFC3339), nil
}
