package utils

func PtrFrom[E any](value E) *E {
	x := value
	return &x
}
