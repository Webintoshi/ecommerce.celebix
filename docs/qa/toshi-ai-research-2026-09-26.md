# Toshi araştırması ve uygulama kararları

Resmî dokümanlar 26 Eylül 2026 tarihinde incelendi. Mevcut Toshi bileşeni API bağlantısı kurulsa da yalnız yerel komut okuyucusunu çalıştırıyordu. Uygulama kararları:

- [Anthropic etkili agent tasarımı](https://www.anthropic.com/engineering/building-effective-agents) ve [araç tasarımı](https://www.anthropic.com/engineering/writing-tools-for-agents): az sayıda açık, yetkili ve sınırlandırılmış araç; katalog/stok/sipariş/müşteri/indirim/satış ve panel yardımı için mevcut repository erişimi. Bu özellik için ek agent framework veya vektör veritabanı gerekli değil.
- [DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode/) ve [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/): thinking açıkça disabled, gerçek tool-call/result protokolü ve model allowlist. [Hata kodları](https://api-docs.deepseek.com/quick_start/error_codes/) ile anahtar, bakiye ve hız sınırı ayrımı.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) ve [reasoning](https://developers.openai.com/api/docs/guides/reasoning): Responses, store:false, gereken output/reasoning öğelerinin tur içinde korunması.
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling?hl=en) ve [thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures): model parçaları ve gerçek call kimlikleri korunur; anahtar yalnız header içinde. [API hataları](https://ai.google.dev/gemini-api/docs/generate-content/api-errors) ve [hız sınırları](https://ai.google.dev/gemini-api/docs/rate-limits) ile status-only RESOURCE_EXHAUSTED güvenli rate_limited olur.
- [Claude araç tanımı](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) ve [tool-call işleme](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls): assistant tool_use blokları ve sonraki user tool_result bloğu korunur.

Konuşma kullanıcının mağaza/üyelik yetkisine ve sabit sağlayıcı/model sürümüne bağlıdır. Kaynaklar model metninden alınmaz, sunucu araçlarından gelir. 50 saniye, üç model isteği, altı araç ve 4096 çıktı token sınırı uygulanır. Otomatik ücretli yeniden deneme yoktur. API bağlı değilse ekran açık yerel mod gösterir; bağlı API hatası Türkçe açıklanır. İncelenen kaynaklar karşılaştırmalı dünyanın en ucuz sağlayıcısı iddiasını kanıtlamaz; fiyat vaadi eklenmedi.

[Uygulama tasarımı](../superpowers/specs/2026-09-26-toshi-real-ai-assistant-design.md), [veritabanı doğrulaması](toshi-real-ai-assistant-validation-2026-09-26.md).
