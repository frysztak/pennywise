// Package errors provides structured business-logic errors that the frontend
// can localize the same way it localizes buf.validate validation failures.
//
// Validation failures from buf.validate carry a buf.validate.Violations detail
// whose Violation entries expose a stable rule_id (e.g. "string.email"). Business
// rules that need a database lookup can't be expressed in proto, so NewBusinessError
// attaches an equivalent Violations detail with a custom rule_id. The frontend maps
// rule_id -> translation key uniformly, regardless of the error's origin.
package errors

import (
	validate "buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go/buf/validate"
	"connectrpc.com/connect"
)

// Rule IDs for business logic not expressible in proto validation. These mirror
// the `id` of CEL rules and are the contract the frontend translates against.
const (
	CodeSenderNotMember   = "transfer.sender_not_member"
	CodeReceiverNotMember = "transfer.receiver_not_member"
	CodeSameUser          = "transfer.same_user"
	CodeMemberExists      = "group.member_exists"
	CodeNotMember         = "group.not_member"
	CodeDefaultCurrency   = "group.default_currency"
	CodeInvalidPassword   = "auth.invalid_password"
	CodePasswordDisabled  = "auth.password_login_disabled"
	CodeRegisterDisabled  = "auth.registration_disabled"
)

// NewBusinessError builds a Connect error carrying a buf.validate.Violations
// detail so the frontend can parse and localize it exactly like a validation
// error. ruleID is the stable identifier the frontend translates; field is the
// optional request field the violation applies to (empty for form-level errors);
// message is the English fallback shown when no translation exists.
func NewBusinessError(code connect.Code, ruleID, field, message string) *connect.Error {
	err := connect.NewError(code, nil)

	violation := &validate.Violation{
		RuleId:  &ruleID,
		Message: &message,
	}
	if field != "" {
		violation.Field = &validate.FieldPath{
			Elements: []*validate.FieldPathElement{
				{FieldName: &field},
			},
		}
	}

	violations := &validate.Violations{
		Violations: []*validate.Violation{violation},
	}

	if detail, detailErr := connect.NewErrorDetail(violations); detailErr == nil {
		err.AddDetail(detail)
	}

	return err
}
