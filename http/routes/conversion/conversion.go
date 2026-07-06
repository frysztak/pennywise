package conversion

import (
	"context"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apperrors "pennywise/errors"
	"pennywise/fx"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ConversionService struct {
	fx fx.Provider
}

func NewConversionService(provider fx.Provider) *ConversionService {
	return &ConversionService{fx: provider}
}

func (s *ConversionService) CreateConversion(ctx context.Context, r *apiv1.CreateConversionRequest) (*apiv1.CreateConversionResponse, error) {
	logger := log.FromContext(ctx)
	if err := helpers.AssertGroupNotArchived(ctx, r.GroupId); err != nil {
		return nil, err
	}

	if r.FromCurrency == r.ToCurrency {
		logger.Warn("conversion creation failed - same currency", "currency", r.FromCurrency, "group_id", r.GroupId)
		return nil, apperrors.NewBusinessError(connect.CodeInvalidArgument,
			apperrors.CodeSameCurrency, "to_currency", "source and target currency must be different")
	}

	conversion, err := db.WriteQueries.CreateCurrencyConversion(ctx, database.CreateCurrencyConversionParams{
		ID:           uuid.NewString(),
		CreatedAt:    overrides.TextTime{Time: time.Now()},
		GroupID:      r.GroupId,
		FromCurrency: r.FromCurrency,
		ToCurrency:   r.ToCurrency,
		Rate:         r.Rate,
		Date:         overrides.TextTime{Time: r.Date.AsTime()},
	})
	if err != nil {
		logger.Error("failed to create conversion", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("conversion created successfully", "conversion_id", conversion.ID, "group_id", r.GroupId, "from", r.FromCurrency, "to", r.ToCurrency, "rate", r.Rate)

	return &apiv1.CreateConversionResponse{Id: conversion.ID}, nil
}

func (s *ConversionService) CreateConversions(ctx context.Context, r *apiv1.CreateConversionsRequest) (*apiv1.CreateConversionsResponse, error) {
	logger := log.FromContext(ctx)
	if err := helpers.AssertGroupNotArchived(ctx, r.GroupId); err != nil {
		return nil, err
	}

	for _, c := range r.Conversions {
		if c.FromCurrency == r.ToCurrency {
			logger.Warn("conversions creation failed - same currency", "currency", c.FromCurrency, "group_id", r.GroupId)
			return nil, apperrors.NewBusinessError(connect.CodeInvalidArgument,
				apperrors.CodeSameCurrency, "to_currency", "source and target currency must be different")
		}
	}

	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		logger.Error("failed to begin transaction", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	qtx := db.WriteQueries.WithTx(tx)
	ids := make([]string, 0, len(r.Conversions))
	for _, c := range r.Conversions {
		conversion, err := qtx.CreateCurrencyConversion(ctx, database.CreateCurrencyConversionParams{
			ID:           uuid.NewString(),
			CreatedAt:    overrides.TextTime{Time: time.Now()},
			GroupID:      r.GroupId,
			FromCurrency: c.FromCurrency,
			ToCurrency:   r.ToCurrency,
			Rate:         c.Rate,
			Date:         overrides.TextTime{Time: c.Date.AsTime()},
		})
		if err != nil {
			logger.Error("failed to create conversion", "error", err, "group_id", r.GroupId, "from", c.FromCurrency)
			return nil, connect.NewError(connect.CodeInternal, err)
		}
		ids = append(ids, conversion.ID)
	}

	if err := tx.Commit(); err != nil {
		logger.Error("failed to commit conversions transaction", "error", err, "count", len(ids))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("conversions created successfully", "group_id", r.GroupId, "to", r.ToCurrency, "count", len(ids))

	return &apiv1.CreateConversionsResponse{Ids: ids}, nil
}

func (s *ConversionService) UpdateConversion(ctx context.Context, r *apiv1.UpdateConversionRequest) (*apiv1.UpdateConversionResponse, error) {
	logger := log.FromContext(ctx)
	if err := helpers.AssertGroupNotArchived(ctx, r.GroupId); err != nil {
		return nil, err
	}

	if r.FromCurrency == r.ToCurrency {
		logger.Warn("conversion update failed - same currency", "currency", r.FromCurrency, "group_id", r.GroupId, "conversion_id", r.Id)
		return nil, apperrors.NewBusinessError(connect.CodeInvalidArgument,
			apperrors.CodeSameCurrency, "to_currency", "source and target currency must be different")
	}

	conversion, err := db.WriteQueries.UpdateCurrencyConversion(ctx, database.UpdateCurrencyConversionParams{
		ID:           r.Id,
		FromCurrency: r.FromCurrency,
		ToCurrency:   r.ToCurrency,
		Rate:         r.Rate,
		Date:         overrides.TextTime{Time: r.Date.AsTime()},
	})
	if err != nil {
		logger.Error("failed to update conversion", "error", err, "conversion_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("conversion updated successfully", "conversion_id", conversion.ID, "from", r.FromCurrency, "to", r.ToCurrency, "rate", r.Rate)

	return &apiv1.UpdateConversionResponse{Id: conversion.ID}, nil
}

func (s *ConversionService) DeleteConversion(ctx context.Context, r *apiv1.DeleteConversionRequest) (*apiv1.DeleteConversionResponse, error) {
	logger := log.FromContext(ctx)
	if err := helpers.AssertGroupNotArchived(ctx, r.GroupId); err != nil {
		return nil, err
	}

	if err := db.WriteQueries.DeleteCurrencyConversion(ctx, r.Id); err != nil {
		logger.Error("failed to delete conversion", "error", err, "conversion_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("conversion deleted successfully", "conversion_id", r.Id)

	return &apiv1.DeleteConversionResponse{}, nil
}

func (s *ConversionService) GetGroupConversions(ctx context.Context, r *apiv1.GetGroupConversionsRequest) (*apiv1.GetGroupConversionsResponse, error) {
	logger := log.FromContext(ctx)
	rows, err := db.ReadQueries.GetGroupConversions(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group conversions", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	conversions := make([]*apiv1.GetGroupConversionsResponse_Conversion, 0, len(rows))
	for _, row := range rows {
		conversions = append(conversions, &apiv1.GetGroupConversionsResponse_Conversion{
			Id:           row.ID,
			CreatedAt:    timestamppb.New(row.CreatedAt.Time),
			FromCurrency: row.FromCurrency,
			ToCurrency:   row.ToCurrency,
			Rate:         row.Rate,
			Date:         timestamppb.New(row.Date.Time),
		})
	}

	logger.Info("group conversions retrieved", "group_id", r.GroupId, "count", len(conversions))

	return &apiv1.GetGroupConversionsResponse{Conversions: conversions}, nil
}

func (s *ConversionService) GetExchangeRate(ctx context.Context, r *apiv1.GetExchangeRateRequest) (*apiv1.GetExchangeRateResponse, error) {
	logger := log.FromContext(ctx)

	date := time.Now()
	if r.Date != nil {
		date = r.Date.AsTime()
	}

	rate, err := s.fx.GetRate(ctx, r.FromCurrency, r.ToCurrency, date)
	if err != nil {
		// Non-fatal: the UI falls back to manual entry.
		logger.Warn("failed to fetch exchange rate", "error", err, "from", r.FromCurrency, "to", r.ToCurrency)
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}

	logger.Info("exchange rate retrieved", "from", r.FromCurrency, "to", r.ToCurrency, "rate", rate.Value, "rate_date", rate.Date)

	return &apiv1.GetExchangeRateResponse{
		Rate:     rate.Value,
		RateDate: timestamppb.New(rate.Date),
	}, nil
}

func (s *ConversionService) GetExchangeRates(ctx context.Context, r *apiv1.GetExchangeRatesRequest) (*apiv1.GetExchangeRatesResponse, error) {
	logger := log.FromContext(ctx)

	date := time.Now()
	if r.Date != nil {
		date = r.Date.AsTime()
	}

	rates := make([]*apiv1.GetExchangeRatesResponse_Rate, 0, len(r.FromCurrencies))
	for _, from := range r.FromCurrencies {
		rate, err := s.fx.GetRate(ctx, from, r.ToCurrency, date)
		if err != nil {
			// Non-fatal: omit this pair, the UI keeps manual entry for it.
			logger.Warn("failed to fetch exchange rate", "error", err, "from", from, "to", r.ToCurrency)
			continue
		}
		rates = append(rates, &apiv1.GetExchangeRatesResponse_Rate{
			FromCurrency: from,
			Rate:         rate.Value,
			RateDate:     timestamppb.New(rate.Date),
		})
	}

	logger.Info("exchange rates retrieved", "to", r.ToCurrency, "requested", len(r.FromCurrencies), "resolved", len(rates))

	return &apiv1.GetExchangeRatesResponse{Rates: rates}, nil
}
