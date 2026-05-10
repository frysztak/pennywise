import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/debug-error")({
  component: DebugError,
});

function DebugError(): never {
  const err = new TypeError(
    "Cannot read properties of undefined (reading 'balance')",
  );
  throw err;
}
