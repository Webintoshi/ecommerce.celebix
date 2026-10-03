import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { createOrAssignAffiliate } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";

export const POST=retiredPlatformMutation;
