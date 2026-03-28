export default function OrderDetailLoading() {
    return (
        <div className="space-y-8">
            {/* Top Navigation */}
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse" />
                <div className="space-y-2">
                    <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                </div>
            </div>

            {/* Timeline & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 h-48 bg-gray-100 rounded-3xl animate-pulse" />
                <div className="space-y-4">
                    <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                    <div className="h-48 bg-gray-100 rounded-3xl animate-pulse" />
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Items */}
                    <div className="h-96 bg-gray-100 rounded-3xl animate-pulse" />
                    {/* Activity Log */}
                    <div className="h-64 bg-gray-100 rounded-3xl animate-pulse" />
                </div>
                <div className="space-y-8">
                    {/* Customer */}
                    <div className="h-56 bg-gray-100 rounded-3xl animate-pulse" />
                    {/* Shipping */}
                    <div className="h-64 bg-gray-100 rounded-3xl animate-pulse" />
                    {/* Payment */}
                    <div className="h-48 bg-gray-100 rounded-3xl animate-pulse" />
                    {/* Notes */}
                    <div className="h-56 bg-gray-100 rounded-3xl animate-pulse" />
                </div>
            </div>
        </div>
    );
}
