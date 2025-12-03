package utils

import (
	"encoding/json"
	"fmt"
)

func JSONStringToSlice(v interface{}) ([]string, error) {
	s, ok := v.(string)
	if !ok {
		return nil, fmt.Errorf("value is not a string")
	}

	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func SliceToJSONString(s ...string) string {
	json, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}

	return string(json)
}
