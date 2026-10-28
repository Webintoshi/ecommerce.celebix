BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert286$
BEGIN
 IF encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid='saas.content_authoring_render_nodes(jsonb)'::regprocedure),'UTF8')),'hex')<>'bdd08a99b473c138ad59250871d4f224eaf0c301defa3fe9b1e1c07dfa5bc189'
 THEN RAISE EXCEPTION 'TOSHI_FORMAT286_RENDERER_INVALID'; END IF;
 IF saas.content_authoring_render_nodes('[{"type":"fact","factRef":"format:bold:product:title:0","value":"Erişte & <img>"}]')<>'<strong>Erişte &amp; &lt;img&gt;</strong>'
  OR saas.content_authoring_render_nodes('[{"type":"text","text":"**Literal**"},{"type":"fact","factRef":"product:existing:0","value":"**Kaynak**"}]')<>'**Literal****Kaynak**'
 THEN RAISE EXCEPTION 'TOSHI_FORMAT286_PARITY_INVALID'; END IF;
END $assert286$;
COMMIT;
