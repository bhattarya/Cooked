"use client";

import { useEffect, useState } from "react";
import type { Alum, Course, Dataset, Meta, Student } from "./types";

let cache: Promise<Dataset> | null = null;

export function loadDataset(): Promise<Dataset> {
  if (!cache) {
    const get = <T,>(f: string) => fetch(`/data/${f}`).then((r) => r.json() as Promise<T>);
    cache = Promise.all([
      get<Alum[]>("alumni.json"),
      get<Student[]>("current.json"),
      get<Course[]>("catalog.json"),
      get<Meta>("meta.json"),
    ]).then(([alumni, current, catalog, meta]) => ({ alumni, current, catalog, meta }));
  }
  return cache;
}

export function useDataset(): Dataset | null {
  const [ds, setDs] = useState<Dataset | null>(null);
  useEffect(() => {
    let live = true;
    loadDataset().then((d) => live && setDs(d));
    return () => {
      live = false;
    };
  }, []);
  return ds;
}
