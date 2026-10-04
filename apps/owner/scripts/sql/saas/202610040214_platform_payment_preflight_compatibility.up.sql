-- Exact compatibility rebind for the approved schema-210 support/sales transformation.
-- Business/payment functions, authority rows, grants, owners and OIDs remain unchanged.
-- Archived validators and pre-existing storefront digest drift are intentionally excluded.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SELECT pg_advisory_xact_lock(hashtextextended('platform-payment-preflight-214',0));
LOCK TABLE saas.platform_support_function_backup IN SHARE MODE;
CREATE TABLE saas.platform_payment_preflight_compatibility_backup(
 signature text PRIMARY KEY,function_oid oid NOT NULL,definition text NOT NULL,
 before_definition_sha text NOT NULL,after_definition_sha text NOT NULL,
 owner_oid oid NOT NULL,acl aclitem[],config text[],security_definer boolean NOT NULL,
 volatility "char" NOT NULL);
ALTER TABLE saas.platform_payment_preflight_compatibility_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.platform_payment_preflight_compatibility_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.platform_payment_preflight_compatibility_backup FROM PUBLIC,
 celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,
 celebix_saas_bootstrap,celebix_saas_platform_operator,celebix_saas_support_runtime;
DO $compatibility$
DECLARE
 manifest jsonb := $manifest${
  "protected": [
    {
      "signature": "saas.iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)",
      "originalDefinitionSha": "fa63e388377599001ee1ee476813f9e8cf6080b1d47eba2c932cb062f87ee263",
      "originalBodyMd5": "27b9164b08b7ea218858deda78f60f2a",
      "approvedDefinitionSha": "a3d3867957ca90d6d8e634e5b32204432b7e677232deeee77e09e112b6834858",
      "approvedBodyMd5": "3af52c1b7075b5985427df5e4c8a5851",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)",
      "originalDefinitionSha": "35278a64b2e4f40870b2c5ce9b962a2b96120a9f68707ab8ef318e72e09affac",
      "originalBodyMd5": "e69d443c49db87d21e600af5640a8978",
      "approvedDefinitionSha": "a1eaa2f81bed19cf21698418f4c3cfdbbd0de569279e5d38593019e33041a0f6",
      "approvedBodyMd5": "f270360c6371b30b308e51e36ad856f2",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)",
      "originalDefinitionSha": "0247b1abfe62b42299c37146aa8ac12a28ea3497661d71da42744397dc9f1702",
      "originalBodyMd5": "958a0980ba9a13d73220e98907ec77ab",
      "approvedDefinitionSha": "315f085516b91639201d3ae53ca1d0f4c0c0076585ad38810bf0de85ce51e392",
      "approvedBodyMd5": "bf29585df195acb0347dc5648cb59267",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
      "originalDefinitionSha": "0bdffaf8c2edb1951391ae9ceb5d137432d17ac8b594d2842d46fa8ba30f16d6",
      "originalBodyMd5": "055fe95458610ea1b303a17378c4cdbb",
      "approvedDefinitionSha": "ed9706663b553e437243b1910ce9da86adc0a0fb95d63536a10ffd79bba17d5a",
      "approvedBodyMd5": "c2b8b92c30980b5d1df435ca9880c990",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
      "originalDefinitionSha": "a3cb27d63fbc6f995a98d1698044b8e14ad665cda78d4c9b3cc3b4548ffee185",
      "originalBodyMd5": "2ece1621c3c3e4f328be7ba8aff0b417",
      "approvedDefinitionSha": "4b269452066c140dd2d747415dcfb82f1b92e90d0ea62856b38ab42d64c1a16d",
      "approvedBodyMd5": "e9b2e841c93247c30acf1e6bb09e0c5b",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)",
      "originalDefinitionSha": "8573a4426cf2837fe193f63216904109baeb18f7ab8e3a52c50876e0db5da849",
      "originalBodyMd5": "842a1aca1b8a6e7fd21c3931fea8403f",
      "approvedDefinitionSha": "6e02f24b9afb8d50e534dbc3f2c12ba711f813f69cf0c6b3044955b14f103f18",
      "approvedBodyMd5": "588f0cbc08cbd8083d3afd3d8864b2d8",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)",
      "originalDefinitionSha": "b51bf6006c73c12914d55b2eab360bd37750efe688aab009c7dfec692d86bb66",
      "originalBodyMd5": "16390c6b605f3d1e0697238c4eefbce9",
      "approvedDefinitionSha": "10b5cae1651b236bd6b0b280d19d00ec4625f975a0c8def5f8dadd4cda31086a",
      "approvedBodyMd5": "5f3038d780f7fb1632e848113630cb0d",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.payment_attempt_begin_without_execution_authority(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)",
      "originalDefinitionSha": "35abe1e74a632f57fcb56f65d87486da81d202c1ff60bc8d79a814f2c032d4a7",
      "originalBodyMd5": "e5439203d385e21cecf9a49826229d3c",
      "approvedDefinitionSha": "2b1b7e716f69daad861006bfa5978b31a04ac6db5f4b6cef17ba1bace3ef9f7e",
      "approvedBodyMd5": "64538a5fde2ce0187f54dd72d21da336",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)",
      "originalDefinitionSha": "886aada3ce5e3ec80caf66745a3443a2af4ad5aae7d888d3654e4a4d369c7b2c",
      "originalBodyMd5": "94f1b7293b59d18b90063fb06c425b9b",
      "approvedDefinitionSha": "97510f24d59291e5a5c1bd03fdcd3193c3bde31a93fa3658b6c94748409a1735",
      "approvedBodyMd5": "909912dc918b5aafcf417da87a7156d8",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)",
      "originalDefinitionSha": "31b6a9cae76125e75abba54c4993e6f1baf4c36c44821e925b7ab4d2849549e4",
      "originalBodyMd5": "95759feb45130750226426a364a9d94d",
      "approvedDefinitionSha": "d33f2cafa92b1003cf0c3c17d70461712c76ad0483208871969936b96d28f643",
      "approvedBodyMd5": "e63d72eac28e2557916f585abb6b7686",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)",
      "originalDefinitionSha": "c46ace64c815e60a60f66cfb219baa65c21d5378e76fef4b17387305e7427f43",
      "originalBodyMd5": "4e9eb9b14d0bb0bd12e40d520d38ce74",
      "approvedDefinitionSha": "40f9dad68815bc8f5a1e7eb209369d4ba08551b70be42298002f366e0d3c13a3",
      "approvedBodyMd5": "78dfa2f756d5cfeed05fd56d3ee34ab5",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    },
    {
      "signature": "saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)",
      "originalDefinitionSha": "76c02206380dbbf0af4f4a3a6941fdec6f17359d0c134b25b4d36f4ccbc658b5",
      "originalBodyMd5": "20319d1078bf21fc4e816312902b26d1",
      "approvedDefinitionSha": "72fb4b405d2216133c83f21e4daddae3b358e6a72a79251a1f3a6f97bd6fd23a",
      "approvedBodyMd5": "c00c277a1945b7b499cb38b913e12f21",
      "owner": "celebix_saas_owner",
      "acl": "{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}",
      "config": [
        "search_path=pg_catalog, saas"
      ],
      "security": true,
      "volatility": "v"
    }
  ],
  "validators": [
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
  ]
}$manifest$::jsonb;
 item jsonb; change jsonb; proc record; saved text; revised text; member_argument text;
 store_argument text; principal_argument text; original_source text; membership_view text;
BEGIN
 -- Closed allowlist: predecessor SHA comes from the independently captured 208 inventory.
 -- Both the original AND the entire approved current definition must match before any DDL.
 FOR item IN SELECT value FROM jsonb_array_elements(manifest->'protected') LOOP
  SELECT p.*,pg_get_functiondef(p.oid) AS definition INTO STRICT proc
   FROM pg_proc p WHERE p.oid=(item->>'signature')::regprocedure;
  SELECT definition INTO STRICT saved FROM saas.platform_support_function_backup
   WHERE signature=item->>'signature';
  original_source:=substring(saved FROM '(?s)AS \$function\$(.*)\$function\$');
  IF encode(sha256(convert_to(saved,'UTF8')),'hex') IS DISTINCT FROM item->>'originalDefinitionSha'
   OR md5(original_source) IS DISTINCT FROM item->>'originalBodyMd5'
   OR encode(sha256(convert_to(proc.definition,'UTF8')),'hex') IS DISTINCT FROM item->>'approvedDefinitionSha'
   OR md5(proc.prosrc) IS DISTINCT FROM item->>'approvedBodyMd5'
   OR proc.proowner IS DISTINCT FROM (item->>'owner')::regrole
   OR proc.proacl::text IS DISTINCT FROM item->>'acl'
   OR to_jsonb(proc.proconfig) IS DISTINCT FROM item->'config'
   OR proc.prosecdef IS DISTINCT FROM (item->>'security')::boolean
   OR proc.provolatile::text IS DISTINCT FROM item->>'volatility'
  THEN RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_PROTECTED_PROOF_INVALID: %',item->>'signature'; END IF;
  -- Re-run only fixed 210 transformations. No inverse stripping or hash auto-enrollment.
  membership_view:='saas.platform_authorized_memberships';
  revised:=regexp_replace(saved,'(FROM|JOIN)([[:space:]]+)saas.memberships([[:space:]]|$)','\1\2'||membership_view||'\3','gi');
  member_argument:=CASE WHEN 'p_membership_id'=ANY(proc.proargnames) THEN 'p_membership_id' WHEN 'p_membership'=ANY(proc.proargnames) THEN 'p_membership' WHEN 'p_member'=ANY(proc.proargnames) THEN 'p_member' END;
  store_argument:=CASE WHEN 'p_store_id'=ANY(proc.proargnames) THEN 'p_store_id' WHEN 'p_store'=ANY(proc.proargnames) THEN 'p_store' END;
  principal_argument:=CASE WHEN 'p_principal_id'=ANY(proc.proargnames) THEN 'p_principal_id' WHEN 'p_principal'=ANY(proc.proargnames) THEN 'p_principal' END;
  IF proc.provolatile='v' AND member_argument IS NOT NULL AND store_argument IS NOT NULL AND principal_argument IS NOT NULL AND original_source~*'(INSERT INTO|UPDATE saas.|DELETE FROM)' THEN
   revised:=regexp_replace(revised,'\mBEGIN\M','BEGIN PERFORM saas.platform_support_begin('||store_argument||','||principal_argument||','||member_argument||','||quote_literal(proc.proname)||');','i');
  END IF;
  IF proc.proname='payment_attempt_begin_without_execution_authority' THEN
   revised:=replace(revised,'SELECT * INTO method FROM saas.payment_methods',
    $literal$IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT * INTO method FROM saas.payment_methods$literal$);
  ELSIF proc.proname='storefront_checkout_submit_builtin' THEN
   revised:=replace(revised,'SELECT method.* INTO selected_method FROM saas.payment_methods method',
    $literal$IF NOT saas.platform_new_sales_allowed(selected_cart.store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT method.* INTO selected_method FROM saas.payment_methods method$literal$);
  END IF;
  IF revised IS DISTINCT FROM proc.definition THEN
   RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_TRANSFORM_INVALID: %',item->>'signature';
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(manifest->'validators') LOOP
  SELECT p.*,pg_get_functiondef(p.oid) AS definition INTO STRICT proc
   FROM pg_proc p WHERE p.oid=(item->>'signature')::regprocedure;
  IF encode(sha256(convert_to(proc.definition,'UTF8')),'hex') IS DISTINCT FROM item->>'beforeDefinitionSha'
   OR md5(proc.prosrc) IS DISTINCT FROM item->>'beforeBodyMd5'
   OR proc.proowner IS DISTINCT FROM (item->>'owner')::regrole
   OR proc.proacl::text IS DISTINCT FROM item->>'acl'
   OR to_jsonb(proc.proconfig) IS DISTINCT FROM item->'config'
   OR proc.prosecdef IS DISTINCT FROM (item->>'security')::boolean
   OR proc.provolatile::text IS DISTINCT FROM item->>'volatility'
  THEN RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_VALIDATOR_PROOF_INVALID: %',item->>'signature'; END IF;
  INSERT INTO saas.platform_payment_preflight_compatibility_backup
   VALUES(item->>'signature',proc.oid,proc.definition,item->>'beforeDefinitionSha',item->>'afterDefinitionSha',
    proc.proowner,proc.proacl,proc.proconfig,proc.prosecdef,proc.provolatile);
 END LOOP;
 -- Child before parent: PayTR -> single-active -> Iyzico evidence -> runtime; keyed -> built-in.
 FOR item IN SELECT value FROM jsonb_array_elements(manifest->'validators') LOOP
  SELECT p.*,pg_get_functiondef(p.oid) AS definition INTO STRICT proc
   FROM pg_proc p WHERE p.oid=(item->>'signature')::regprocedure;
  revised:=proc.definition;
  FOR change IN SELECT value FROM jsonb_array_elements(item->'replacements') LOOP
   IF (length(revised)-length(replace(revised,quote_literal(change->>'old'),''))) / length(quote_literal(change->>'old')) <> 1 THEN
    RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_LITERAL_AMBIGUOUS: %',item->>'signature'; END IF;
   revised:=replace(revised,quote_literal(change->>'old'),quote_literal(change->>'new'));
  END LOOP;
  IF encode(sha256(convert_to(revised,'UTF8')),'hex') IS DISTINCT FROM item->>'afterDefinitionSha' THEN
   RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_REBIND_INVALID: %',item->>'signature'; END IF;
  EXECUTE revised;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=proc.oid
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=item->>'afterDefinitionSha'
   AND md5(p.prosrc)=item->>'afterBodyMd5'
   AND p.proowner=proc.proowner AND p.proacl IS NOT DISTINCT FROM proc.proacl
   AND p.proconfig IS NOT DISTINCT FROM proc.proconfig AND p.prosecdef=proc.prosecdef
   AND p.provolatile=proc.provolatile) THEN
   RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_POSTCONDITION_INVALID: %',item->>'signature'; END IF;
 END LOOP;
 -- Original preflight implementations retain every metadata/ACL/authority check and error.
 IF saas.paytr_iframe_activation_preflight() IS DISTINCT FROM true
  OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true
  OR saas.iyzico_iframe_tenant_evidence_preflight() IS DISTINCT FROM true
  OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  OR saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
  OR saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
  OR saas.quick_order_hosted_payment_authority_preflight() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'PLATFORM_PAYMENT_COMPATIBILITY_PREFLIGHT_REJECTED'; END IF;
END $compatibility$;
COMMIT;
