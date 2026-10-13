"use client";
import type {Store} from './types';
// Historical invitation rows remain readable; access links are retired.
export function InvitationRecovery(_props:Readonly<{storeId:string;invitation:NonNullable<Store['invitations']>[number];disabled?:boolean;fetcher?:typeof fetch}>){return null;}
