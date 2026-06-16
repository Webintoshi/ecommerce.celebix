import { createServerClient } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────
export type AIProvider = "gemini" | "claude" | "deepseek";

export interface AIProviderConfig {
    provider: AIProvider;
    apiKey: string;
    model?: string;
}

interface AICallOptions {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
}

// ─── Default Models ──────────────────────────────────────────────────────────
const DEFAULT_MODELS: Record<AIProvider, string> = {
    gemini: "gemini-2.5-flash",
    claude: "claude-sonnet-4-20250514",
    deepseek: "deepseek-chat",
};

// ─── Read AI Config from DB (with .env fallback) ─────────────────────────────
export async function getAIConfig(): Promise<AIProviderConfig> {
    try {
        const supabase = createServerClient();
        const { data } = await supabase
            .from("settings")
            .select("value")
            .eq("key", "ai_provider")
            .single();

        if (data?.value) {
            const config = data.value as unknown as AIProviderConfig;
            if (config.provider && config.apiKey) {
                return {
                    provider: config.provider,
                    apiKey: config.apiKey,
                    model: config.model || DEFAULT_MODELS[config.provider],
                };
            }
        }
    } catch {
        // DB read failed — fall through to .env
    }

    // Fallback: .env GEMINI_API_KEY
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) {
        return {
            provider: "gemini",
            apiKey: envKey,
            model: DEFAULT_MODELS.gemini,
        };
    }

    throw new Error("AI provider yapılandırılmamış. Admin panelinden API key girin veya .env dosyasına GEMINI_API_KEY ekleyin.");
}

// ─── Unified AI Call (simple prompt → text) ──────────────────────────────────
export async function callAI(
    prompt: string,
    options: AICallOptions = {}
): Promise<string> {
    const config = await getAIConfig();
    const { temperature = 0.5, maxTokens = 2048 } = options;

    switch (config.provider) {
        case "gemini":
            return callGemini(config, prompt, temperature, maxTokens);
        case "claude":
            return callClaude(config, prompt, temperature, maxTokens);
        case "deepseek":
            return callDeepSeek(config, prompt, temperature, maxTokens);
        default:
            throw new Error(`Desteklenmeyen provider: ${config.provider}`);
    }
}

// ─── Unified AI Call with Function Calling (Toshi) ───────────────────────────
export async function callAIWithFunctions(options: {
    messages: { role: string; parts: { text: string }[] }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    functionDeclarations: any[];
    systemPrompt: string;
    executeFunction: (name: string, args: Record<string, string>) => Promise<string>;
    maxFunctionCalls?: number;
    temperature?: number;
    maxTokens?: number;
}): Promise<string> {
    const config = await getAIConfig();

    // Function calling currently only with Gemini — others get text-only mode
    if (config.provider === "gemini") {
        return callGeminiWithFunctions(config, options);
    }

    // For Claude/DeepSeek: convert messages to plain text chat
    return callNonGeminiChat(config, options);
}

// ─── Test API Key ────────────────────────────────────────────────────────────
export async function testAIConnection(config: AIProviderConfig): Promise<{ success: boolean; message: string }> {
    try {
        const model = config.model || DEFAULT_MODELS[config.provider];
        const testConfig = { ...config, model };

        switch (config.provider) {
            case "gemini": {
                const text = await callGemini(testConfig, "Say 'Toshi OK' in exactly 2 words.", 0.1, 50);
                return { success: true, message: `Gemini bağlantısı başarılı! Yanıt: "${text.substring(0, 50)}"` };
            }
            case "claude": {
                const text = await callClaude(testConfig, "Say 'Toshi OK' in exactly 2 words.", 0.1, 50);
                return { success: true, message: `Claude bağlantısı başarılı! Yanıt: "${text.substring(0, 50)}"` };
            }
            case "deepseek": {
                const text = await callDeepSeek(testConfig, "Say 'Toshi OK' in exactly 2 words.", 0.1, 50);
                return { success: true, message: `DeepSeek bağlantısı başarılı! Yanıt: "${text.substring(0, 50)}"` };
            }
            default:
                return { success: false, message: "Bilinmeyen provider" };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Bağlantı hatası";
        return { success: false, message: msg };
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provider-specific implementations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Gemini ──────────────────────────────────────────────────────────────────
async function callGemini(
    config: AIProviderConfig,
    prompt: string,
    temperature: number,
    maxTokens: number
): Promise<string> {
    const model = config.model || DEFAULT_MODELS.gemini;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API hatası: ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini'den boş yanıt geldi.");
    return text;
}

// Gemini with function calling (multi-turn loop)
async function callGeminiWithFunctions(
    config: AIProviderConfig,
    options: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        functionDeclarations: any[];
        systemPrompt: string;
        executeFunction: (name: string, args: Record<string, string>) => Promise<string>;
        maxFunctionCalls?: number;
        temperature?: number;
        maxTokens?: number;
    }
): Promise<string> {
    const model = config.model || DEFAULT_MODELS.gemini;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
    const maxCalls = options.maxFunctionCalls || 3;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contents: any[] = [...options.messages];
    let finalText = "";

    for (let turn = 0; turn < maxCalls + 1; turn++) {
        const payload = {
            system_instruction: { parts: [{ text: options.systemPrompt }] },
            contents,
            tools: [{ function_declarations: options.functionDeclarations }],
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxTokens || 4096,
            },
        };

        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Gemini API hatası:", response.status, errText);
            throw new Error(`Gemini API hatası (${response.status})`);
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fnCallPart = parts.find((p: any) => p.functionCall);
        if (fnCallPart?.functionCall) {
            const { name, args } = fnCallPart.functionCall;
            console.log(`[AI] Gemini function call #${turn + 1}: ${name}`);

            const result = await options.executeFunction(name, args || {});

            contents = [
                ...contents,
                { role: "model", parts: [{ functionCall: { name, args: args || {} } }] },
                { role: "function", parts: [{ functionResponse: { name, response: { result } } }] },
            ];

            if (turn >= maxCalls - 1) {
                finalText = result;
                break;
            }
            continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textPart = parts.find((p: any) => p.text);
        finalText = textPart?.text ?? "Yanıt oluşturulamadı.";
        break;
    }

    return finalText;
}

// ─── Claude (Anthropic) ──────────────────────────────────────────────────────
async function callClaude(
    config: AIProviderConfig,
    prompt: string,
    temperature: number,
    maxTokens: number
): Promise<string> {
    const model = config.model || DEFAULT_MODELS.claude;
    const url = "https://api.anthropic.com/v1/messages";

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: "user", content: prompt }],
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API hatası: ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error("Claude'dan boş yanıt geldi.");
    return text;
}

// ─── DeepSeek (OpenAI-uyumlu) ────────────────────────────────────────────────
async function callDeepSeek(
    config: AIProviderConfig,
    prompt: string,
    temperature: number,
    maxTokens: number
): Promise<string> {
    const model = config.model || DEFAULT_MODELS.deepseek;
    const url = "https://api.deepseek.com/v1/chat/completions";

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: "user", content: prompt }],
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `DeepSeek API hatası: ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("DeepSeek'ten boş yanıt geldi.");
    return text;
}

// ─── Non-Gemini chat fallback (Claude/DeepSeek for Toshi) ────────────────────
async function callNonGeminiChat(
    config: AIProviderConfig,
    options: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: any[];
        systemPrompt: string;
        executeFunction: (name: string, args: Record<string, string>) => Promise<string>;
        temperature?: number;
        maxTokens?: number;
    }
): Promise<string> {
    // Convert Gemini message format → standard chat format
    const chatMessages = options.messages
        .filter((m: { role: string }) => m.role === "user" || m.role === "model")
        .map((m: { role: string; parts: { text: string }[] }) => ({
            role: m.role === "model" ? "assistant" : "user",
            content: m.parts?.[0]?.text || "",
        }));

    // For non-Gemini: inject system prompt + tell model to request data via special tags
    const systemPrompt = `${options.systemPrompt}

## ÖNEMLİ: Veri Erişim Kuralları
Bu sohbette fonksiyon çağırma özelliğin yok. Eğer gerçek zamanlı veriye ihtiyacın varsa, kullanıcıya sahip olduğun verilere dayanarak yanıt ver. Tahmin etme, bildiklerini söyle.`;

    if (config.provider === "claude") {
        const model = config.model || DEFAULT_MODELS.claude;
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": config.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model,
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature || 0.7,
                system: systemPrompt,
                messages: chatMessages,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Claude API error: ${res.status}`);
        }

        const data = await res.json();
        return data.content?.[0]?.text ?? "Yanıt oluşturulamadı.";
    }

    // DeepSeek (OpenAI format)
    const model = config.model || DEFAULT_MODELS.deepseek;
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature || 0.7,
            messages: [
                { role: "system", content: systemPrompt },
                ...chatMessages,
            ],
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `DeepSeek API error: ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "Yanıt oluşturulamadı.";
}
