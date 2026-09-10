import { cn } from "@/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/25 dark:bg-muted dark:shadow-[inset_0_1px_1px_rgb(0_0_0/0.30)] dark:disabled:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
