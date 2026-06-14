"use client";
import { useEffect } from "react";

export default function PlanesPage() {
  useEffect(() => {
    window.location.href = "/#planes";
  }, []);

  return null;
}
