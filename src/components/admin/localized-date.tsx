"use client";

import { useEffect, useState } from "react";

export function LocalizedDate({ value }: { value: string }) {
  const [formattedDate, setFormattedDate] = useState<string>();

  useEffect(() => {
    setFormattedDate(new Date(value).toLocaleDateString());
  }, [value]);

  return formattedDate ?? null;
}
