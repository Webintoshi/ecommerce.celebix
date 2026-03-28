"use client";

import { PageForm } from "@/components/admin/PageForm";

export default function NewStaticPage() {
    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
            <div className="max-w-5xl mx-auto">
                <PageForm />
            </div>
        </div>
    );
}
