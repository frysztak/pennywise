package transfer

import (
	"context"
	"errors"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/log"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type TransferService struct{}

func NewTransferService() *TransferService {
	return &TransferService{}
}

func (s *TransferService) CreateTransfer(ctx context.Context, r *apiv1.CreateTransferRequest) (*apiv1.CreateTransferResponse, error) {
	logger := log.FromContext(ctx)
	// Validate sender is in group
	senderInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.SenderId,
		GroupID: r.GroupId,
	})
	if err != nil {
		logger.Error("failed to check if sender in group", "error", err, "sender_id", r.SenderId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if senderInGroup == 0 {
		logger.Warn("transfer creation failed - sender not in group", "sender_id", r.SenderId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender is not a member of this group"))
	}

	// Validate receiver is in group
	receiverInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.ReceiverId,
		GroupID: r.GroupId,
	})
	if err != nil {
		logger.Error("failed to check if receiver in group", "error", err, "receiver_id", r.ReceiverId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if receiverInGroup == 0 {
		logger.Warn("transfer creation failed - receiver not in group", "receiver_id", r.ReceiverId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("receiver is not a member of this group"))
	}

	// Validate sender != receiver
	if r.SenderId == r.ReceiverId {
		logger.Warn("transfer creation failed - sender and receiver are the same", "sender_id", r.SenderId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender and receiver must be different users"))
	}

	transfer, err := db.Queries.CreateTransfer(ctx, database.CreateTransferParams{
		ID:         uuid.NewString(),
		CreatedAt:  overrides.TextTime{Time: time.Now()},
		GroupID:    r.GroupId,
		SenderID:   r.SenderId,
		ReceiverID: r.ReceiverId,
		Amount:     int64(r.Amount * 100),
		Currency:   r.Currency,
		Date:       overrides.TextTime{Time: r.Date.AsTime()},
	})
	if err != nil {
		logger.Error("failed to create transfer", "error", err, "group_id", r.GroupId, "sender_id", r.SenderId, "receiver_id", r.ReceiverId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("transfer created successfully", "transfer_id", transfer.ID, "group_id", r.GroupId, "sender_id", r.SenderId, "receiver_id", r.ReceiverId, "amount", r.Amount, "currency", r.Currency)

	return &apiv1.CreateTransferResponse{Id: transfer.ID}, nil
}

func (s *TransferService) GetGroupTransfers(ctx context.Context, r *apiv1.GetGroupTransfersRequest) (*apiv1.GetGroupTransfersResponse, error) {
	logger := log.FromContext(ctx)
	rows, err := db.Queries.GetGroupTransfers(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group transfers", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	transfers := make([]*apiv1.GetGroupTransfersResponse_Transfer, 0, len(rows))
	for _, row := range rows {
		transfers = append(transfers, &apiv1.GetGroupTransfersResponse_Transfer{
			Id:           row.ID,
			CreatedAt:    timestamppb.New(row.CreatedAt.Time),
			SenderId:     row.SenderID,
			SenderName:   row.SenderName,
			ReceiverId:   row.ReceiverID,
			ReceiverName: row.ReceiverName,
			Amount:       row.Amount,
			Currency:     row.Currency,
			Date:         timestamppb.New(row.Date.Time),
		})
	}

	logger.Info("group transfers retrieved", "group_id", r.GroupId, "count", len(transfers))

	return &apiv1.GetGroupTransfersResponse{Transfers: transfers}, nil
}

func (s *TransferService) UpdateTransfer(ctx context.Context, r *apiv1.UpdateTransferRequest) (*apiv1.UpdateTransferResponse, error) {
	logger := log.FromContext(ctx)
	// Get existing transfer to find group_id for validation
	existing, err := db.Queries.GetTransferById(ctx, r.Id)
	if err != nil {
		logger.Error("failed to get transfer for update", "error", err, "transfer_id", r.Id)
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	// Validate sender is in group
	senderInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.SenderId,
		GroupID: existing.GroupID,
	})
	if err != nil {
		logger.Error("failed to check if sender in group", "error", err, "sender_id", r.SenderId, "group_id", existing.GroupID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if senderInGroup == 0 {
		logger.Warn("transfer update failed - sender not in group", "sender_id", r.SenderId, "group_id", existing.GroupID, "transfer_id", r.Id)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender is not a member of this group"))
	}

	// Validate receiver is in group
	receiverInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.ReceiverId,
		GroupID: existing.GroupID,
	})
	if err != nil {
		logger.Error("failed to check if receiver in group", "error", err, "receiver_id", r.ReceiverId, "group_id", existing.GroupID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if receiverInGroup == 0 {
		logger.Warn("transfer update failed - receiver not in group", "receiver_id", r.ReceiverId, "group_id", existing.GroupID, "transfer_id", r.Id)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("receiver is not a member of this group"))
	}

	// Validate sender != receiver
	if r.SenderId == r.ReceiverId {
		logger.Warn("transfer update failed - sender and receiver are the same", "sender_id", r.SenderId, "group_id", existing.GroupID, "transfer_id", r.Id)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender and receiver must be different users"))
	}

	transfer, err := db.Queries.UpdateTransfer(ctx, database.UpdateTransferParams{
		ID:         r.Id,
		SenderID:   r.SenderId,
		ReceiverID: r.ReceiverId,
		Amount:     int64(r.Amount * 100),
		Currency:   r.Currency,
		Date:       overrides.TextTime{Time: r.Date.AsTime()},
	})
	if err != nil {
		logger.Error("failed to update transfer", "error", err, "transfer_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("transfer updated successfully", "transfer_id", r.Id, "sender_id", r.SenderId, "receiver_id", r.ReceiverId, "amount", r.Amount, "currency", r.Currency)

	return &apiv1.UpdateTransferResponse{Id: transfer.ID}, nil
}

func (s *TransferService) DeleteTransfer(ctx context.Context, r *apiv1.DeleteTransferRequest) (*apiv1.DeleteTransferResponse, error) {
	logger := log.FromContext(ctx)
	err := db.Queries.DeleteTransfer(ctx, r.Id)
	if err != nil {
		logger.Error("failed to delete transfer", "error", err, "transfer_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("transfer deleted successfully", "transfer_id", r.Id)

	return &apiv1.DeleteTransferResponse{}, nil
}
