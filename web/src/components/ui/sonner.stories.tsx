import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Toaster } from "./sonner";

function Demo(props: React.ComponentProps<typeof Toaster>) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => toast("Receipt scanned")}>
          Default
        </Button>
        <Button variant="outline" onClick={() => toast.success("Expense created!")}>
          Success
        </Button>
        <Button variant="outline" onClick={() => toast.info("3 items added to your draft.")}>
          Info
        </Button>
        <Button variant="outline" onClick={() => toast.warning("Some items have low confidence.")}>
          Warning
        </Button>
        <Button variant="outline" onClick={() => toast.error("Scan failed. Please try again.")}>
          Error
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const id = toast.loading("Scanning receipt...");
            setTimeout(() => toast.success("Done!", { id }), 1500);
          }}
        >
          Loading → success
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.success("Expense created!", {
              description: "Coffee at Blue Bottle · 4.50 EUR",
            })
          }
        >
          With description
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast("Receipt deleted", {
              action: { label: "Undo", onClick: () => toast.success("Restored") },
            })
          }
        >
          With action
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.promise(new Promise((res) => setTimeout(res, 1500)), {
              loading: "Saving expenses...",
              success: "Saved 3 expenses!",
              error: "Failed to save",
            })
          }
        >
          Promise
        </Button>
      </div>
      <Toaster {...props} />
    </div>
  );
}

const meta = {
  component: Toaster,
  parameters: { layout: "fullscreen" },
  render: (args) => <Demo {...args} />,
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const TopRight: Story = {
  args: { position: "top-right" },
};

export const RichColors: Story = {
  args: { richColors: true },
};

export const Expanded: Story = {
  args: { expand: true, visibleToasts: 5 },
};
