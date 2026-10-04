-- Restore exactly the seven predecessor validators; preserve payment/business functions.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SELECT pg_advisory_xact_lock(hashtextextended('platform-payment-preflight-214',0));
LOCK TABLE saas.platform_payment_preflight_compatibility_backup IN EXCLUSIVE MODE;
DO $rollback$
DECLARE manifest jsonb := $manifest$[
  {
    "signature": "saas.paytr_iframe_activation_preflight()",
    "beforeDefinitionSha": "bacca7e863bb5771024c6e4dde07f54771cd02bf10736fedc1941bb287f72298",
    "beforeBodyMd5": "bb4800816726bbac405b5025403a2435",
    "afterDefinitionSha": "8c03d8e1a8baab5108bc9e485f80897d57d1fc509e6549f036aefa411347c1dc",
    "afterBodyMd5": "de99b659ad4557a170745a6d40f8a75a",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "v",
    "replacements": [
      {
        "target": "saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)",
        "old": "842a1aca1b8a6e7fd21c3931fea8403f",
        "new": "588f0cbc08cbd8083d3afd3d8864b2d8"
      },
      {
        "target": "saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
        "old": "055fe95458610ea1b303a17378c4cdbb",
        "new": "c2b8b92c30980b5d1df435ca9880c990"
      },
      {
        "target": "saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
        "old": "2ece1621c3c3e4f328be7ba8aff0b417",
        "new": "e9b2e841c93247c30acf1e6bb09e0c5b"
      },
      {
        "target": "saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)",
        "old": "4e9eb9b14d0bb0bd12e40d520d38ce74",
        "new": "78dfa2f756d5cfeed05fd56d3ee34ab5"
      },
      {
        "target": "saas.payment_attempt_begin_without_execution_authority(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)",
        "old": "e5439203d385e21cecf9a49826229d3c",
        "new": "64538a5fde2ce0187f54dd72d21da336"
      }
    ]
  },
  {
    "signature": "saas.payment_method_single_active_provider_preflight()",
    "beforeDefinitionSha": "5e6d0fe78c9fe7e267792feded5333695410a89c3eeeaf4ff3ec7557e2498eae",
    "beforeBodyMd5": "85a7339bdbcebd9c69ee5489f0481ce4",
    "afterDefinitionSha": "0f135f4314e1eaba87300862bf584216356cad4f17625a45d0a5983b903893d6",
    "afterBodyMd5": "8cf79ef23d6ce07b179ab7cccd90c651",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "s",
    "replacements": [
      {
        "target": "saas.paytr_iframe_activation_preflight()",
        "old": "bb4800816726bbac405b5025403a2435",
        "new": "de99b659ad4557a170745a6d40f8a75a"
      }
    ]
  },
  {
    "signature": "saas.iyzico_iframe_tenant_evidence_preflight()",
    "beforeDefinitionSha": "0d7efa2cf8a61bd715ba369b384873836df739945ec349ad1b1fde275bdbffb2",
    "beforeBodyMd5": "37d62c7b91d55757f9b53647569c450b",
    "afterDefinitionSha": "d244d696f40ef7c12c79e5f936323110c577ae751dc85f21ee1c78bf10dd3628",
    "afterBodyMd5": "9e3caaf15be00bae7aabcfdda0312a04",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "s",
    "replacements": [
      {
        "target": "iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)",
        "old": "e69d443c49db87d21e600af5640a8978",
        "new": "f270360c6371b30b308e51e36ad856f2"
      },
      {
        "target": "iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)",
        "old": "27b9164b08b7ea218858deda78f60f2a",
        "new": "3af52c1b7075b5985427df5e4c8a5851"
      },
      {
        "target": "saas.payment_method_single_active_provider_preflight()",
        "old": "85a7339bdbcebd9c69ee5489f0481ce4",
        "new": "8cf79ef23d6ce07b179ab7cccd90c651"
      }
    ]
  },
  {
    "signature": "saas.iyzico_iframe_tenant_activation_runtime_preflight()",
    "beforeDefinitionSha": "c824198cc8763ac1838e411834d02f8021309d933078f91233169fdaad97fb76",
    "beforeBodyMd5": "d8e63f02153e7eed8d18519f283b34d9",
    "afterDefinitionSha": "5a2a07709b438cf180b8a69d3b57ffb1717e62982f1f7083fa5d6493abf370b3",
    "afterBodyMd5": "1d327060429c425451460e9b64a242bf",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "s",
    "replacements": [
      {
        "target": "payment_method_single_active_provider_preflight()",
        "old": "85a7339bdbcebd9c69ee5489f0481ce4",
        "new": "8cf79ef23d6ce07b179ab7cccd90c651"
      },
      {
        "target": "iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)",
        "old": "e69d443c49db87d21e600af5640a8978",
        "new": "f270360c6371b30b308e51e36ad856f2"
      },
      {
        "target": "iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)",
        "old": "27b9164b08b7ea218858deda78f60f2a",
        "new": "3af52c1b7075b5985427df5e4c8a5851"
      },
      {
        "target": "iyzico_iframe_tenant_evidence_preflight()",
        "old": "37d62c7b91d55757f9b53647569c450b",
        "new": "9e3caaf15be00bae7aabcfdda0312a04"
      },
      {
        "target": "iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)",
        "old": "958a0980ba9a13d73220e98907ec77ab",
        "new": "bf29585df195acb0347dc5648cb59267"
      }
    ]
  },
  {
    "signature": "saas.payment_provider_keyed_lifecycle_preflight()",
    "beforeDefinitionSha": "6cb7a39c14538e8d1285d918753d57016c183a28b856bb3096792d6e26fa9e8b",
    "beforeBodyMd5": "8983b28d075eda62453decb82b1b5880",
    "afterDefinitionSha": "0416cb6362f7bd1856c9cb784e5723aea863a56052bed2375b9e9f585eb22188",
    "afterBodyMd5": "2cf86d5c5bdccf5ffc4bae5f3e344a79",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "v",
    "replacements": [
      {
        "target": "saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)",
        "old": "16390c6b605f3d1e0697238c4eefbce9",
        "new": "5f3038d780f7fb1632e848113630cb0d"
      },
      {
        "target": "saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)",
        "old": "95759feb45130750226426a364a9d94d",
        "new": "e63d72eac28e2557916f585abb6b7686"
      },
      {
        "target": "saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)",
        "old": "94f1b7293b59d18b90063fb06c425b9b",
        "new": "909912dc918b5aafcf417da87a7156d8"
      }
    ]
  },
  {
    "signature": "saas.built_in_payment_methods_preflight_without_provider_compatibili()",
    "beforeDefinitionSha": "b49475c90a80c254885988d5218fad055ae806d3db7a21dbdf2640559eb32ecc",
    "beforeBodyMd5": "aaf7c11ecf08eaa950ccdebe1d3b839b",
    "afterDefinitionSha": "84eaefdf4de3bac4745dfee67dbe03c5b05497332f18d60ef50eb0397ff77a02",
    "afterBodyMd5": "71b42bfe3e4c923e177d505baf87078e",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "s",
    "replacements": [
      {
        "target": "saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)",
        "old": "94f1b7293b59d18b90063fb06c425b9b",
        "new": "909912dc918b5aafcf417da87a7156d8"
      }
    ]
  },
  {
    "signature": "saas.built_in_payment_methods_preflight()",
    "beforeDefinitionSha": "080be185f2dd5ef85c16e3831dddb16b132427b2a810232db34f0e561b6dbc93",
    "beforeBodyMd5": "54c393baa4a396d0526908e8fad359a5",
    "afterDefinitionSha": "45c77d4721e4f5d7a6df443cd647955d6757744c13e59fd8fef49011b5a50abf",
    "afterBodyMd5": "9259186766d4740ee520d18a8bfbd848",
    "owner": "celebix_saas_owner",
    "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
    "config": [
      "search_path=pg_catalog, saas"
    ],
    "security": true,
    "volatility": "s",
    "replacements": [
      {
        "target": "saas.payment_provider_keyed_lifecycle_preflight()",
        "old": "8983b28d075eda62453decb82b1b5880",
        "new": "2cf86d5c5bdccf5ffc4bae5f3e344a79"
      },
      {
        "target": "saas.built_in_payment_methods_preflight_without_provider_compatibili()",
        "old": "aaf7c11ecf08eaa950ccdebe1d3b839b",
        "new": "71b42bfe3e4c923e177d505baf87078e"
      }
    ]
  }
]$manifest$::jsonb; saved record; proc record; item jsonb;
BEGIN
 IF (SELECT count(*) FROM saas.platform_payment_preflight_compatibility_backup)<>7 THEN
  RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_ROLLBACK_BACKUP_INVALID'; END IF;
 FOR saved IN SELECT * FROM saas.platform_payment_preflight_compatibility_backup ORDER BY signature LOOP
  SELECT value INTO STRICT item FROM jsonb_array_elements(manifest) WHERE value->>'signature'=saved.signature;
  IF saved.before_definition_sha IS DISTINCT FROM item->>'beforeDefinitionSha'
   OR saved.after_definition_sha IS DISTINCT FROM item->>'afterDefinitionSha'
   OR saved.owner_oid IS DISTINCT FROM (item->>'owner')::regrole
   OR saved.acl::text IS DISTINCT FROM item->>'acl'
   OR to_jsonb(saved.config) IS DISTINCT FROM item->'config'
   OR saved.security_definer IS DISTINCT FROM (item->>'security')::boolean
   OR saved.volatility::text IS DISTINCT FROM item->>'volatility' THEN
   RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_ROLLBACK_BACKUP_INVALID: %',saved.signature; END IF;
  SELECT p.*,pg_get_functiondef(p.oid) AS definition INTO STRICT proc
   FROM pg_proc p WHERE p.oid=saved.signature::regprocedure;
  IF proc.oid IS DISTINCT FROM saved.function_oid OR proc.proowner IS DISTINCT FROM saved.owner_oid
   OR proc.proacl IS DISTINCT FROM saved.acl OR proc.proconfig IS DISTINCT FROM saved.config
   OR proc.prosecdef IS DISTINCT FROM saved.security_definer OR proc.provolatile IS DISTINCT FROM saved.volatility
   OR encode(sha256(convert_to(proc.definition,'UTF8')),'hex') IS DISTINCT FROM saved.after_definition_sha
   OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.before_definition_sha THEN
   RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_ROLLBACK_DRIFT: %',saved.signature; END IF;
 END LOOP;
 FOR saved IN SELECT * FROM saas.platform_payment_preflight_compatibility_backup ORDER BY signature LOOP
  EXECUTE saved.definition;
  IF saved.function_oid IS DISTINCT FROM saved.signature::regprocedure::oid
   OR encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.before_definition_sha THEN
   RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_ROLLBACK_POSTCONDITION: %',saved.signature; END IF;
 END LOOP;
END $rollback$;
DROP TABLE saas.platform_payment_preflight_compatibility_backup;
COMMIT;
