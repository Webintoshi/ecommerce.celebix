import {
  CATALOG_PRODUCT_SORTS,
  CATALOG_PRODUCT_STOCK_FILTERS,
  PRODUCT_STATUSES,
  VARIANT_STATUSES,
  type CatalogProductListQuery,
  type CatalogProductListQueryBinding,
  type CatalogProductSort,
  type CatalogProductStockFilter,
  type Product,
  type CatalogProductListVariantSummary,
  type CatalogBulkProductIntent,
  type CatalogProductPageSize,
  type ProductStatus,
  type ProductVariant,
  type VariantStatus,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;
const ATTRIBUTE_KEY = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,63})$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DESCRIPTION_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const CATALOG_CASE_FOLD_SOURCE = "ABCDEFGHJKLMNOPQRSTUVWXYZµÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞĀĂĄĆĈĊČĎĐĒĔĖĘĚĜĞĠĢĤĦĨĪĬĮĲĴĶĹĻĽĿŁŃŅŇŊŌŎŐŒŔŖŘŚŜŞŠŢŤŦŨŪŬŮŰŲŴŶŸŹŻŽſƁƂƄƆƇƉƊƋƎƏƐƑƓƔƖƗƘƜƝƟƠƢƤƦƧƩƬƮƯƱƲƳƵƷƸƼǄǅǇǈǊǋǍǏǑǓǕǗǙǛǞǠǢǤǦǨǪǬǮǱǲǴǶǷǸǺǼǾȀȂȄȆȈȊȌȎȐȒȔȖȘȚȜȞȠȢȤȦȨȪȬȮȰȲȺȻȽȾɁɃɄɅɆɈɊɌɎͅͰͲͶͿΆΈΉΊΌΎΏΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩΪΫςϏϐϑϕϖϘϚϜϞϠϢϤϦϨϪϬϮϰϱϴϵϷϹϺϽϾϿЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯѠѢѤѦѨѪѬѮѰѲѴѶѸѺѼѾҀҊҌҎҐҒҔҖҘҚҜҞҠҢҤҦҨҪҬҮҰҲҴҶҸҺҼҾӀӁӃӅӇӉӋӍӐӒӔӖӘӚӜӞӠӢӤӦӨӪӬӮӰӲӴӶӸӺӼӾԀԂԄԆԈԊԌԎԐԒԔԖԘԚԜԞԠԢԤԦԨԪԬԮԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖႠႡႢႣႤႥႦႧႨႩႪႫႬႭႮႯႰႱႲႳႴႵႶႷႸႹႺႻႼႽႾႿჀჁჂჃჄჅჇჍᏸᏹᏺᏻᏼᏽᲀᲁᲂᲃᲄᲅᲆᲇᲈᲐᲑᲒᲓᲔᲕᲖᲗᲘᲙᲚᲛᲜᲝᲞᲟᲠᲡᲢᲣᲤᲥᲦᲧᲨᲩᲪᲫᲬᲭᲮᲯᲰᲱᲲᲳᲴᲵᲶᲷᲸᲹᲺᲽᲾᲿḀḂḄḆḈḊḌḎḐḒḔḖḘḚḜḞḠḢḤḦḨḪḬḮḰḲḴḶḸḺḼḾṀṂṄṆṈṊṌṎṐṒṔṖṘṚṜṞṠṢṤṦṨṪṬṮṰṲṴṶṸṺṼṾẀẂẄẆẈẊẌẎẐẒẔẛẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸỺỼỾἈἉἊἋἌἍἎἏἘἙἚἛἜἝἨἩἪἫἬἭἮἯἸἹἺἻἼἽἾἿὈὉὊὋὌὍὙὛὝὟὨὩὪὫὬὭὮὯᾸᾹᾺΆιῈΈῊΉῘῙῚΊῨῩῪΎῬῸΌῺΏΩKÅℲⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅬⅭⅮⅯↃⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⱠⱢⱣⱤⱧⱩⱫⱭⱮⱯⱰⱲⱵⱾⱿⲀⲂⲄⲆⲈⲊⲌⲎⲐⲒⲔⲖⲘⲚⲜⲞⲠⲢⲤⲦⲨⲪⲬⲮⲰⲲⲴⲶⲸⲺⲼⲾⳀⳂⳄⳆⳈⳊⳌⳎⳐⳒⳔⳖⳘⳚⳜⳞⳠⳢⳫⳭⳲꙀꙂꙄꙆꙈꙊꙌꙎꙐꙒꙔꙖꙘꙚꙜꙞꙠꙢꙤꙦꙨꙪꙬꚀꚂꚄꚆꚈꚊꚌꚎꚐꚒꚔꚖꚘꚚꜢꜤꜦꜨꜪꜬꜮꜲꜴꜶꜸꜺꜼꜾꝀꝂꝄꝆꝈꝊꝌꝎꝐꝒꝔꝖꝘꝚꝜꝞꝠꝢꝤꝦꝨꝪꝬꝮꝹꝻꝽꝾꞀꞂꞄꞆꞋꞍꞐꞒꞖꞘꞚꞜꞞꞠꞢꞤꞦꞨꞪꞫꞬꞭꞮꞰꞱꞲꞳꞴꞶꞸꞺꞼꞾꟂꟄꟅꟆꟇꟉꟵꭰꭱꭲꭳꭴꭵꭶꭷꭸꭹꭺꭻꭼꭽꭾꭿꮀꮁꮂꮃꮄꮅꮆꮇꮈꮉꮊꮋꮌꮍꮎꮏꮐꮑꮒꮓꮔꮕꮖꮗꮘꮙꮚꮛꮜꮝꮞꮟꮠꮡꮢꮣꮤꮥꮦꮧꮨꮩꮪꮫꮬꮭꮮꮯꮰꮱꮲꮳꮴꮵꮶꮷꮸꮹꮺꮻꮼꮽꮾꮿＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ𐐀𐐁𐐂𐐃𐐄𐐅𐐆𐐇𐐈𐐉𐐊𐐋𐐌𐐍𐐎𐐏𐐐𐐑𐐒𐐓𐐔𐐕𐐖𐐗𐐘𐐙𐐚𐐛𐐜𐐝𐐞𐐟𐐠𐐡𐐢𐐣𐐤𐐥𐐦𐐧𐒰𐒱𐒲𐒳𐒴𐒵𐒶𐒷𐒸𐒹𐒺𐒻𐒼𐒽𐒾𐒿𐓀𐓁𐓂𐓃𐓄𐓅𐓆𐓇𐓈𐓉𐓊𐓋𐓌𐓍𐓎𐓏𐓐𐓑𐓒𐓓𐲀𐲁𐲂𐲃𐲄𐲅𐲆𐲇𐲈𐲉𐲊𐲋𐲌𐲍𐲎𐲏𐲐𐲑𐲒𐲓𐲔𐲕𐲖𐲗𐲘𐲙𐲚𐲛𐲜𐲝𐲞𐲟𐲠𐲡𐲢𐲣𐲤𐲥𐲦𐲧𐲨𐲩𐲪𐲫𐲬𐲭𐲮𐲯𐲰𐲱𐲲𑢠𑢡𑢢𑢣𑢤𑢥𑢦𑢧𑢨𑢩𑢪𑢫𑢬𑢭𑢮𑢯𑢰𑢱𑢲𑢳𑢴𑢵𑢶𑢷𑢸𑢹𑢺𑢻𑢼𑢽𑢾𑢿𖹀𖹁𖹂𖹃𖹄𖹅𖹆𖹇𖹈𖹉𖹊𖹋𖹌𖹍𖹎𖹏𖹐𖹑𖹒𖹓𖹔𖹕𖹖𖹗𖹘𖹙𖹚𖹛𖹜𖹝𖹞𖹟𞤀𞤁𞤂𞤃𞤄𞤅𞤆𞤇𞤈𞤉𞤊𞤋𞤌𞤍𞤎𞤏𞤐𞤑𞤒𞤓𞤔𞤕𞤖𞤗𞤘𞤙𞤚𞤛𞤜𞤝𞤞𞤟𞤠𞤡";
const CATALOG_CASE_FOLD_TARGET = Object.freeze([..."abcdefghjklmnopqrstuvwxyzμàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþāăąćĉċčďđēĕėęěĝğġģĥħĩīĭįĳĵķĺļľŀłńņňŋōŏőœŕŗřśŝşšţťŧũūŭůűųŵŷÿźżžsɓƃƅɔƈɖɗƌǝəɛƒɠɣɩɨƙɯɲɵơƣƥʀƨʃƭʈưʊʋƴƶʒƹƽǆǆǉǉǌǌǎǐǒǔǖǘǚǜǟǡǣǥǧǩǫǭǯǳǳǵƕƿǹǻǽǿȁȃȅȇȉȋȍȏȑȓȕȗșțȝȟƞȣȥȧȩȫȭȯȱȳⱥȼƚⱦɂƀʉʌɇɉɋɍɏιͱͳͷϳάέήίόύώαβγδεζηθικλμνξοπρστυφχψωϊϋσϗβθφπϙϛϝϟϡϣϥϧϩϫϭϯκρθεϸϲϻͻͼͽѐёђѓєѕіїјљњћќѝўџабвгдежзийклмнопрстуфхцчшщъыьэюяѡѣѥѧѩѫѭѯѱѳѵѷѹѻѽѿҁҋҍҏґғҕҗҙқҝҟҡңҥҧҩҫҭүұҳҵҷҹһҽҿӏӂӄӆӈӊӌӎӑӓӕӗәӛӝӟӡӣӥӧөӫӭӯӱӳӵӷӹӻӽӿԁԃԅԇԉԋԍԏԑԓԕԗԙԛԝԟԡԣԥԧԩԫԭԯաբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆⴀⴁⴂⴃⴄⴅⴆⴇⴈⴉⴊⴋⴌⴍⴎⴏⴐⴑⴒⴓⴔⴕⴖⴗⴘⴙⴚⴛⴜⴝⴞⴟⴠⴡⴢⴣⴤⴥⴧⴭᏰᏱᏲᏳᏴᏵвдосттъѣꙋაბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰჱჲჳჴჵჶჷჸჹჺჽჾჿḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕṡạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹỻỽỿἀἁἂἃἄἅἆἇἐἑἒἓἔἕἠἡἢἣἤἥἦἧἰἱἲἳἴἵἶἷὀὁὂὃὄὅὑὓὕὗὠὡὢὣὤὥὦὧᾰᾱὰάιὲέὴήῐῑὶίῠῡὺύῥὸόὼώωkåⅎⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻⅼⅽⅾⅿↄⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱡɫᵽɽⱨⱪⱬɑɱɐɒⱳⱶȿɀⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱⲳⲵⲷⲹⲻⲽⲿⳁⳃⳅⳇⳉⳋⳍⳏⳑⳓⳕⳗⳙⳛⳝⳟⳡⳣⳬⳮⳳꙁꙃꙅꙇꙉꙋꙍꙏꙑꙓꙕꙗꙙꙛꙝꙟꙡꙣꙥꙧꙩꙫꙭꚁꚃꚅꚇꚉꚋꚍꚏꚑꚓꚕꚗꚙꚛꜣꜥꜧꜩꜫꜭꜯꜳꜵꜷꜹꜻꜽꜿꝁꝃꝅꝇꝉꝋꝍꝏꝑꝓꝕꝗꝙꝛꝝꝟꝡꝣꝥꝧꝩꝫꝭꝯꝺꝼᵹꝿꞁꞃꞅꞇꞌɥꞑꞓꞗꞙꞛꞝꞟꞡꞣꞥꞧꞩɦɜɡɬɪʞʇʝꭓꞵꞷꞹꞻꞽꞿꟃꞔʂᶎꟈꟊꟶᎠᎡᎢᎣᎤᎥᎦᎧᎨᎩᎪᎫᎬᎭᎮᎯᎰᎱᎲᎳᎴᎵᎶᎷᎸᎹᎺᎻᎼᎽᎾᎿᏀᏁᏂᏃᏄᏅᏆᏇᏈᏉᏊᏋᏌᏍᏎᏏᏐᏑᏒᏓᏔᏕᏖᏗᏘᏙᏚᏛᏜᏝᏞᏟᏠᏡᏢᏣᏤᏥᏦᏧᏨᏩᏪᏫᏬᏭᏮᏯａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ𐐨𐐩𐐪𐐫𐐬𐐭𐐮𐐯𐐰𐐱𐐲𐐳𐐴𐐵𐐶𐐷𐐸𐐹𐐺𐐻𐐼𐐽𐐾𐐿𐑀𐑁𐑂𐑃𐑄𐑅𐑆𐑇𐑈𐑉𐑊𐑋𐑌𐑍𐑎𐑏𐓘𐓙𐓚𐓛𐓜𐓝𐓞𐓟𐓠𐓡𐓢𐓣𐓤𐓥𐓦𐓧𐓨𐓩𐓪𐓫𐓬𐓭𐓮𐓯𐓰𐓱𐓲𐓳𐓴𐓵𐓶𐓷𐓸𐓹𐓺𐓻𐳀𐳁𐳂𐳃𐳄𐳅𐳆𐳇𐳈𐳉𐳊𐳋𐳌𐳍𐳎𐳏𐳐𐳑𐳒𐳓𐳔𐳕𐳖𐳗𐳘𐳙𐳚𐳛𐳜𐳝𐳞𐳟𐳠𐳡𐳢𐳣𐳤𐳥𐳦𐳧𐳨𐳩𐳪𐳫𐳬𐳭𐳮𐳯𐳰𐳱𐳲𑣀𑣁𑣂𑣃𑣄𑣅𑣆𑣇𑣈𑣉𑣊𑣋𑣌𑣍𑣎𑣏𑣐𑣑𑣒𑣓𑣔𑣕𑣖𑣗𑣘𑣙𑣚𑣛𑣜𑣝𑣞𑣟𖹠𖹡𖹢𖹣𖹤𖹥𖹦𖹧𖹨𖹩𖹪𖹫𖹬𖹭𖹮𖹯𖹰𖹱𖹲𖹳𖹴𖹵𖹶𖹷𖹸𖹹𖹺𖹻𖹼𖹽𖹾𖹿𞤢𞤣𞤤𞤥𞤦𞤧𞤨𞤩𞤪𞤫𞤬𞤭𞤮𞤯𞤰𞤱𞤲𞤳𞤴𞤵𞤶𞤷𞤸𞤹𞤺𞤻𞤼𞤽𞤾𞤿𞥀𞥁𞥂𞥃"]);
const CATALOG_CASE_FOLD_SINGLE = Object.freeze(Object.fromEntries(
  [...CATALOG_CASE_FOLD_SOURCE].map((character, index) => [character, CATALOG_CASE_FOLD_TARGET[index]!]),
));
const CATALOG_CASE_FOLD_MULTI_SOURCE = Object.freeze(["ß","ŉ","ǰ","ΐ","ΰ","և","ẖ","ẗ","ẘ","ẙ","ẚ","ẞ","ὐ","ὒ","ὔ","ὖ","ᾀ","ᾁ","ᾂ","ᾃ","ᾄ","ᾅ","ᾆ","ᾇ","ᾈ","ᾉ","ᾊ","ᾋ","ᾌ","ᾍ","ᾎ","ᾏ","ᾐ","ᾑ","ᾒ","ᾓ","ᾔ","ᾕ","ᾖ","ᾗ","ᾘ","ᾙ","ᾚ","ᾛ","ᾜ","ᾝ","ᾞ","ᾟ","ᾠ","ᾡ","ᾢ","ᾣ","ᾤ","ᾥ","ᾦ","ᾧ","ᾨ","ᾩ","ᾪ","ᾫ","ᾬ","ᾭ","ᾮ","ᾯ","ᾲ","ᾳ","ᾴ","ᾶ","ᾷ","ᾼ","ῂ","ῃ","ῄ","ῆ","ῇ","ῌ","ῒ","ΐ","ῖ","ῗ","ῢ","ΰ","ῤ","ῦ","ῧ","ῲ","ῳ","ῴ","ῶ","ῷ","ῼ","ﬀ","ﬁ","ﬂ","ﬃ","ﬄ","ﬅ","ﬆ","ﬓ","ﬔ","ﬕ","ﬖ","ﬗ"]);
const CATALOG_CASE_FOLD_MULTI_TARGET = Object.freeze(["ss","ʼn","ǰ","ΐ","ΰ","եւ","ẖ","ẗ","ẘ","ẙ","aʾ","ss","ὐ","ὒ","ὔ","ὖ","ἀι","ἁι","ἂι","ἃι","ἄι","ἅι","ἆι","ἇι","ἀι","ἁι","ἂι","ἃι","ἄι","ἅι","ἆι","ἇι","ἠι","ἡι","ἢι","ἣι","ἤι","ἥι","ἦι","ἧι","ἠι","ἡι","ἢι","ἣι","ἤι","ἥι","ἦι","ἧι","ὠι","ὡι","ὢι","ὣι","ὤι","ὥι","ὦι","ὧι","ὠι","ὡι","ὢι","ὣι","ὤι","ὥι","ὦι","ὧι","ὰι","αι","άι","ᾶ","ᾶι","αι","ὴι","ηι","ήι","ῆ","ῆι","ηι","ῒ","ΐ","ῖ","ῗ","ῢ","ΰ","ῤ","ῦ","ῧ","ὼι","ωι","ώι","ῶ","ῶι","ωι","ff","fi","fl","ffi","ffl","st","st","մն","մե","մի","վն","մխ"]);

function invalid(): never {
  throw new TypeError("catalog_contract_invalid");
}

function catalogProductSearchKey(value: string): string {
  let folded = [...value.normalize("NFC").replaceAll("I", "ı").replaceAll("İ", "i")]
    .map((character) => CATALOG_CASE_FOLD_SINGLE[character] ?? character)
    .join("");
  for (let index = 0; index < CATALOG_CASE_FOLD_MULTI_SOURCE.length; index += 1) {
    folded = folded.replaceAll(CATALOG_CASE_FOLD_MULTI_SOURCE[index]!, CATALOG_CASE_FOLD_MULTI_TARGET[index]!);
  }
  return folded.normalize("NFC");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) invalid();
  return value;
}

function description(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 10_000 ||
    value !== value.trim() ||
    DESCRIPTION_CONTROL.test(value)
  ) invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid();
  return value;
}

function safeInteger(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function status<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  return string(value[key], minimum, maximum, pattern);
}

function attributes(value: unknown): Readonly<Record<string, string>> {
  const parsed = record(value);
  const entries = Object.entries(parsed);
  if (entries.length > 32 || JSON.stringify(parsed).length > 8_192) invalid();
  const output: Record<string, string> = {};
  for (const [key, nested] of entries) {
    string(key, 1, 64, ATTRIBUTE_KEY);
    output[key] = string(nested, 0, 256);
  }
  return Object.freeze(output);
}

export function parseProduct(value: unknown): Product {
  const parsed = exact(
    value,
    ["id", "storeId", "slug", "title", "status", "currency", "createdAt", "updatedAt", "version"],
    ["description"],
  );
  const product = {
    id: uuid(parsed.id),
    storeId: uuid(parsed.storeId),
    slug: string(parsed.slug, 3, 100, SLUG),
    title: string(parsed.title, 1, 200),
    ...(Object.hasOwn(parsed, "description")
      ? { description: description(parsed.description) }
      : {}),
    status: status<ProductStatus>(parsed.status, PRODUCT_STATUSES),
    currency: string(parsed.currency, 3, 3, /^[A-Z]{3}$/),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
    version: safeInteger(parsed.version, 1),
  } satisfies Product;
  if (product.updatedAt < product.createdAt) invalid();
  return Object.freeze(product);
}

export function parseProductVariant(value: unknown): ProductVariant {
  const parsed = exact(
    value,
    [
      "id", "productId", "storeId", "title", "priceCents", "stockTracking",
      "stockQuantity", "status", "attributes", "createdAt", "updatedAt", "version",
    ],
    ["sku", "barcode", "compareAtCents", "costCents"],
  );
  const priceCents = safeInteger(parsed.priceCents, 0);
  const compareAtCents = Object.hasOwn(parsed, "compareAtCents")
    ? safeInteger(parsed.compareAtCents, 0)
    : undefined;
  if (compareAtCents !== undefined && compareAtCents < priceCents) invalid();
  const variant = {
    id: uuid(parsed.id),
    productId: uuid(parsed.productId),
    storeId: uuid(parsed.storeId),
    title: string(parsed.title, 1, 200),
    ...(Object.hasOwn(parsed, "sku") ? { sku: optionalString(parsed, "sku", 1, 64, SKU)! } : {}),
    ...(Object.hasOwn(parsed, "barcode") ? { barcode: optionalString(parsed, "barcode", 1, 128)! } : {}),
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    ...(Object.hasOwn(parsed, "costCents") ? { costCents: safeInteger(parsed.costCents, 0) } : {}),
    stockTracking: parsed.stockTracking === true
      ? true
      : parsed.stockTracking === false
        ? false
        : invalid(),
    stockQuantity: safeInteger(parsed.stockQuantity, 0),
    status: status<VariantStatus>(parsed.status, VARIANT_STATUSES),
    attributes: attributes(parsed.attributes),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
    version: safeInteger(parsed.version, 1),
  } satisfies ProductVariant;
  if (variant.updatedAt < variant.createdAt) invalid();
  return Object.freeze(variant);
}

export function parseCatalogProductListVariantSummary(value: unknown): CatalogProductListVariantSummary {
  const parsed = exact(
    value,
    ["variantId", "priceCents", "stockTracking", "stockQuantity"],
    ["sku", "compareAtCents"],
  );
  const priceCents = safeInteger(parsed.priceCents, 0);
  const compareAtCents = Object.hasOwn(parsed, "compareAtCents")
    ? safeInteger(parsed.compareAtCents, 0)
    : undefined;
  if (compareAtCents !== undefined && compareAtCents < priceCents) invalid();
  return Object.freeze({
    variantId: uuid(parsed.variantId),
    ...(Object.hasOwn(parsed, "sku") ? { sku: optionalString(parsed, "sku", 1, 64, SKU)! } : {}),
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    stockTracking: parsed.stockTracking === true
      ? true
      : parsed.stockTracking === false
        ? false
        : invalid(),
    stockQuantity: safeInteger(parsed.stockQuantity, 0),
  });
}

export function parseCatalogProductListQuery(value: unknown): CatalogProductListQuery {
  const parsed = exact(value, [], [
    "search", "status", "stock", "categoryId", "brandId", "collectionId", "sort",
  ]);
  let search: string | undefined;
  if (Object.hasOwn(parsed, "search")) {
    if (typeof parsed.search !== "string") invalid();
    const normalized = parsed.search.trim();
    if (normalized.length > 200 || CONTROL.test(normalized)) invalid();
    if (normalized !== "") search = normalized;
  }
  const productStatus = Object.hasOwn(parsed, "status")
    ? status<ProductStatus>(parsed.status, PRODUCT_STATUSES)
    : undefined;
  const stock = Object.hasOwn(parsed, "stock")
    ? status<CatalogProductStockFilter>(parsed.stock, CATALOG_PRODUCT_STOCK_FILTERS)
    : undefined;
  const sort = Object.hasOwn(parsed, "sort")
    ? status<CatalogProductSort>(parsed.sort, CATALOG_PRODUCT_SORTS)
    : "updated-desc";
  return Object.freeze({
    ...(search === undefined ? {} : { search }),
    ...(productStatus === undefined ? {} : { status: productStatus }),
    ...(stock === undefined ? {} : { stock }),
    ...(Object.hasOwn(parsed, "categoryId") ? { categoryId: uuid(parsed.categoryId) } : {}),
    ...(Object.hasOwn(parsed, "brandId") ? { brandId: uuid(parsed.brandId) } : {}),
    ...(Object.hasOwn(parsed, "collectionId") ? { collectionId: uuid(parsed.collectionId) } : {}),
    sort,
  });
}

export function parseCatalogProductPageSize(value: unknown): CatalogProductPageSize {
  if (value !== 20 && value !== 50 && value !== 100) invalid();
  return value;
}

export function parseCatalogBulkProductIntent(value: unknown): CatalogBulkProductIntent {
  const parsed = exact(value, ["action", "targets"]);
  if (parsed.action !== "active" && parsed.action !== "draft" && parsed.action !== "archive") invalid();
  if (!Array.isArray(parsed.targets) || parsed.targets.length < 1 || parsed.targets.length > 100) invalid();
  const targets = Object.freeze(parsed.targets.map((candidate) => {
    const target = exact(candidate, ["productId", "expectedVersion"]);
    return Object.freeze({
      productId: uuid(target.productId),
      expectedVersion: safeInteger(target.expectedVersion, 1),
    });
  }));
  if (new Set(targets.map(({ productId }) => productId)).size !== targets.length) invalid();
  return Object.freeze({ action: parsed.action, targets });
}

export function catalogProductListQueryBinding(value: unknown): CatalogProductListQueryBinding {
  const query = parseCatalogProductListQuery(value);
  const search = query.search === undefined ? undefined : catalogProductSearchKey(query.search);
  return Object.freeze({
    version: 1,
    search: search ?? null,
    status: query.status ?? null,
    stock: query.stock ?? null,
    categoryId: query.categoryId ?? null,
    brandId: query.brandId ?? null,
    collectionId: query.collectionId ?? null,
    sort: query.sort,
  });
}

export function catalogProductListQueryDigest(value: unknown): string {
  return `catalog-product-list-query:v1:${JSON.stringify(catalogProductListQueryBinding(value))}`;
}
