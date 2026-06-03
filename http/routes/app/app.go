package app

import (
	"context"

	apiv1 "pennywise/gen/api/v1"
	"pennywise/settings"
)

type AppService struct{}

func NewAppService() *AppService {
	return &AppService{}
}

func (s *AppService) GetCurrencies(ctx context.Context, r *apiv1.GetCurrenciesRequest) (*apiv1.GetCurrenciesResponse, error) {
	return &apiv1.GetCurrenciesResponse{
		Currencies: settings.GetCurrencies(ctx),
	}, nil
}
