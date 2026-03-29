import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { host, key, urlList } = body;

        if (!host || !key || !urlList) {
            return NextResponse.json({ success: false, message: 'Eksik parametreler.' }, { status: 400 });
        }

        // IndexNow API Endpoint (Bing serves as a central hub for IndexNow)
        // Submitting to Bing automatically shares with Yandex and Seznam.
        const endpoint = 'https://api.indexnow.org/indexnow';

        const payload = {
            host,
            key,
            keyLocation: `https://${host}/${key}.txt`,
            urlList,
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            return NextResponse.json({ success: true, message: "Başarıyla gönderildi (200 OK)." });
        } else {
            const errorText = await response.text();
            return NextResponse.json({ success: false, message: `Hata: ${response.status} - ${errorText}` }, { status: response.status });
        }

    } catch (error) {
        console.error('IndexNow Error:', error);
        return NextResponse.json({ success: false, message: 'Sunucu hatası oluştu.' }, { status: 500 });
    }
}
