"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useCanlıKategoriler = () =>
  useQuery({ queryKey: ["live", "cats"], queryFn: api.liveKategoriler });

export const useCanlıStreams = (categoryId?: string, enabled = true) =>
  useQuery({
    queryKey: ["live", "streams", categoryId ?? "all"],
    queryFn: () => api.liveStreams(categoryId),
    enabled,
  });

export const useVodKategoriler = () =>
  useQuery({ queryKey: ["vod", "cats"], queryFn: api.vodKategoriler });

export const useVodStreams = (categoryId?: string, enabled = true) =>
  useQuery({
    queryKey: ["vod", "streams", categoryId ?? "all"],
    queryFn: () => api.vodStreams(categoryId),
    enabled,
  });

export const useVodInfo = (id?: string) =>
  useQuery({ queryKey: ["vod", "info", id], queryFn: () => api.vodInfo(id!), enabled: !!id });

export const useDizilerKategoriler = () =>
  useQuery({ queryKey: ["series", "cats"], queryFn: api.seriesKategoriler });

export const useDizilerList = (categoryId?: string, enabled = true) =>
  useQuery({
    queryKey: ["series", "list", categoryId ?? "all"],
    queryFn: () => api.series(categoryId),
    enabled,
  });

export const useDizilerInfo = (id?: string) =>
  useQuery({ queryKey: ["series", "info", id], queryFn: () => api.seriesInfo(id!), enabled: !!id });

export const useEpg = (streamId?: number, enabled = true) =>
  useQuery({
    queryKey: ["epg", streamId],
    queryFn: () => api.epg(streamId!),
    enabled: !!streamId && enabled,
    staleTime: 60_000,
  });
