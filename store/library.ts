"use client";

import { create } from "zustand";
import type { Profile, StreamKind } from "@/lib/xtream/types";

export interface WatchProgress { key:string; kind:StreamKind; id:string; seriesId?:string; title:string; poster?:string; ext:string; position:number; duration:number; updatedAt:number; }
export interface FavItem { id:number; name:string; poster?:string; ext?:string; }
interface FavSets { live:FavItem[]; movie:FavItem[]; series:FavItem[]; }
export interface FreeFavItem { url:string; name:string; logo?:string; }
interface LibraryState {
  profiles: Profile[]; favourites: FavSets; freeFavourites: FreeFavItem[]; progress: Record<string,WatchProgress>; recentLive:number[]; loaded:boolean;
  setProfiles:(p:Profile[])=>void; addProfile:(p:Profile)=>void; removeProfile:(id:string)=>void;
  load:()=>Promise<void>; toggleFav:(kind:keyof FavSets,item:FavItem)=>void; isFav:(kind:keyof FavSets,id:number)=>boolean;
  toggleFreeFav:(item:FreeFavItem)=>void; isFreeFav:(url:string)=>boolean; saveProgress:(p:WatchProgress)=>void; clearProgress:(key:string)=>void; pushRecentLive:(id:number)=>void;
}

async function write(body:unknown){try{await fetch("/api/library",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body),keepalive:true});}catch{} }

export const useLibrary=create<LibraryState>()((set,get)=>({
  profiles:[], favourites:{live:[],movie:[],series:[]}, freeFavourites:[], progress:{}, recentLive:[], loaded:false,
  setProfiles:(profiles)=>set({profiles}),
  addProfile:(p)=>set(s=>({profiles:[p,...s.profiles.filter(x=>x.id!==p.id)].slice(0,12)})),
  removeProfile:(id)=>set(s=>({profiles:s.profiles.filter(p=>p.id!==id)})),
  load:async()=>{try{const r=await fetch("/api/library",{credentials:"same-origin"});if(!r.ok)return;const d=await r.json();const favourites={live:[],movie:[],series:[]} as FavSets;(d.favourites??[]).forEach((x:any)=>{if(favourites[x.kind as keyof FavSets])favourites[x.kind as keyof FavSets].push({id:Number(x.item_id),name:x.name,poster:x.poster??undefined,ext:x.ext??undefined});});const progress:Record<string,WatchProgress>={};(d.progress??[]).forEach((x:any)=>{progress[x.item_key]={key:x.item_key,kind:x.kind,id:String(x.item_id),seriesId:x.series_id??undefined,title:x.title,poster:x.poster??undefined,ext:x.ext,position:Number(x.position),duration:Number(x.duration),updatedAt:Number(x.updated_at)};});set({favourites,freeFavourites:(d.freeFavourites??[]).map((x:any)=>({url:x.url,name:x.name,logo:x.logo??undefined})),progress,recentLive:d.recentLive??[],loaded:true});}catch{}},
  toggleFav:(kind,item)=>{set(s=>{const has=s.favourites[kind].some(x=>x.id===item.id);return{favourites:{...s.favourites,[kind]:has?s.favourites[kind].filter(x=>x.id!==item.id):[item,...s.favourites[kind]]}}});void write({action:"favorite",kind,item});},
  isFav:(kind,id)=>get().favourites[kind].some(x=>x.id===id),
  toggleFreeFav:(item)=>{set(s=>{const has=s.freeFavourites.some(x=>x.url===item.url);return{freeFavourites:has?s.freeFavourites.filter(x=>x.url!==item.url):[item,...s.freeFavourites]}});void write({action:"freeFavorite",item});},
  isFreeFav:(url)=>get().freeFavourites.some(x=>x.url===url),
  saveProgress:(p)=>{set(s=>{if(p.duration>0&&p.position/p.duration>.95){const n={...s.progress};delete n[p.key];return{progress:n}}return{progress:{...s.progress,[p.key]:p}}});void write({action:"progress",progress:p});},
  clearProgress:(key)=>{set(s=>{const n={...s.progress};delete n[key];return{progress:n}});void write({action:"clearProgress",key});},
  pushRecentLive:(id)=>{set(s=>({recentLive:[id,...s.recentLive.filter(x=>x!==id)].slice(0,24)}));void write({action:"recentLive",id});}
}));
export function continueWatching(progress:Record<string,WatchProgress>):WatchProgress[]{return Object.values(progress).filter(p=>p.duration>0&&p.position>15).sort((a,b)=>b.updatedAt-a.updatedAt);}
