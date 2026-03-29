
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function OrderSuccessToast() {
    const searchParams = useSearchParams();

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            toast.success("Siparişiniz başarıyla oluşturuldu!");
        }
    }, [searchParams]);

    return null;
}
