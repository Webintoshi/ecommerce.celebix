"use client";

import { use } from "react";
import { PageForm } from "@/components/admin/PageForm";
import { getCmsPages } from "@/lib/cms";
import { notFound } from "next/navigation";

export default function EditStaticPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const pages = getCmsPages();
    const page = pages.find(p => p.id === id);

    if (!page) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
            <div className="max-w-5xl mx-auto">
                <PageForm initialData={page} />
            </div>
        </div>
    );
}
