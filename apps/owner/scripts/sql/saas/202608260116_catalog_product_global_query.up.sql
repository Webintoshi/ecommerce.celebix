BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_product_search_key(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  folded text;
  mapping_index integer;
  multi_source CONSTANT text[] := ARRAY['ß','ŉ','ǰ','ΐ','ΰ','և','ẖ','ẗ','ẘ','ẙ','ẚ','ẞ','ὐ','ὒ','ὔ','ὖ','ᾀ','ᾁ','ᾂ','ᾃ','ᾄ','ᾅ','ᾆ','ᾇ','ᾈ','ᾉ','ᾊ','ᾋ','ᾌ','ᾍ','ᾎ','ᾏ','ᾐ','ᾑ','ᾒ','ᾓ','ᾔ','ᾕ','ᾖ','ᾗ','ᾘ','ᾙ','ᾚ','ᾛ','ᾜ','ᾝ','ᾞ','ᾟ','ᾠ','ᾡ','ᾢ','ᾣ','ᾤ','ᾥ','ᾦ','ᾧ','ᾨ','ᾩ','ᾪ','ᾫ','ᾬ','ᾭ','ᾮ','ᾯ','ᾲ','ᾳ','ᾴ','ᾶ','ᾷ','ᾼ','ῂ','ῃ','ῄ','ῆ','ῇ','ῌ','ῒ','ΐ','ῖ','ῗ','ῢ','ΰ','ῤ','ῦ','ῧ','ῲ','ῳ','ῴ','ῶ','ῷ','ῼ','ﬀ','ﬁ','ﬂ','ﬃ','ﬄ','ﬅ','ﬆ','ﬓ','ﬔ','ﬕ','ﬖ','ﬗ'];
  multi_target CONSTANT text[] := ARRAY['ss','ʼn','ǰ','ΐ','ΰ','եւ','ẖ','ẗ','ẘ','ẙ','aʾ','ss','ὐ','ὒ','ὔ','ὖ','ἀι','ἁι','ἂι','ἃι','ἄι','ἅι','ἆι','ἇι','ἀι','ἁι','ἂι','ἃι','ἄι','ἅι','ἆι','ἇι','ἠι','ἡι','ἢι','ἣι','ἤι','ἥι','ἦι','ἧι','ἠι','ἡι','ἢι','ἣι','ἤι','ἥι','ἦι','ἧι','ὠι','ὡι','ὢι','ὣι','ὤι','ὥι','ὦι','ὧι','ὠι','ὡι','ὢι','ὣι','ὤι','ὥι','ὦι','ὧι','ὰι','αι','άι','ᾶ','ᾶι','αι','ὴι','ηι','ήι','ῆ','ῆι','ηι','ῒ','ΐ','ῖ','ῗ','ῢ','ΰ','ῤ','ῦ','ῧ','ὼι','ωι','ώι','ῶ','ῶι','ωι','ff','fi','fl','ffi','ffl','st','st','մն','մե','մի','վն','մխ'];
BEGIN
  folded := pg_catalog.translate(
    pg_catalog.replace(
      pg_catalog.replace(pg_catalog.normalize(p_value, 'NFC'), 'I', 'ı'),
      'İ',
      'i'
    ),
    'ABCDEFGHJKLMNOPQRSTUVWXYZµÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞĀĂĄĆĈĊČĎĐĒĔĖĘĚĜĞĠĢĤĦĨĪĬĮĲĴĶĹĻĽĿŁŃŅŇŊŌŎŐŒŔŖŘŚŜŞŠŢŤŦŨŪŬŮŰŲŴŶŸŹŻŽſƁƂƄƆƇƉƊƋƎƏƐƑƓƔƖƗƘƜƝƟƠƢƤƦƧƩƬƮƯƱƲƳƵƷƸƼǄǅǇǈǊǋǍǏǑǓǕǗǙǛǞǠǢǤǦǨǪǬǮǱǲǴǶǷǸǺǼǾȀȂȄȆȈȊȌȎȐȒȔȖȘȚȜȞȠȢȤȦȨȪȬȮȰȲȺȻȽȾɁɃɄɅɆɈɊɌɎͅͰͲͶͿΆΈΉΊΌΎΏΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩΪΫςϏϐϑϕϖϘϚϜϞϠϢϤϦϨϪϬϮϰϱϴϵϷϹϺϽϾϿЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯѠѢѤѦѨѪѬѮѰѲѴѶѸѺѼѾҀҊҌҎҐҒҔҖҘҚҜҞҠҢҤҦҨҪҬҮҰҲҴҶҸҺҼҾӀӁӃӅӇӉӋӍӐӒӔӖӘӚӜӞӠӢӤӦӨӪӬӮӰӲӴӶӸӺӼӾԀԂԄԆԈԊԌԎԐԒԔԖԘԚԜԞԠԢԤԦԨԪԬԮԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖႠႡႢႣႤႥႦႧႨႩႪႫႬႭႮႯႰႱႲႳႴႵႶႷႸႹႺႻႼႽႾႿჀჁჂჃჄჅჇჍᏸᏹᏺᏻᏼᏽᲀᲁᲂᲃᲄᲅᲆᲇᲈᲐᲑᲒᲓᲔᲕᲖᲗᲘᲙᲚᲛᲜᲝᲞᲟᲠᲡᲢᲣᲤᲥᲦᲧᲨᲩᲪᲫᲬᲭᲮᲯᲰᲱᲲᲳᲴᲵᲶᲷᲸᲹᲺᲽᲾᲿḀḂḄḆḈḊḌḎḐḒḔḖḘḚḜḞḠḢḤḦḨḪḬḮḰḲḴḶḸḺḼḾṀṂṄṆṈṊṌṎṐṒṔṖṘṚṜṞṠṢṤṦṨṪṬṮṰṲṴṶṸṺṼṾẀẂẄẆẈẊẌẎẐẒẔẛẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸỺỼỾἈἉἊἋἌἍἎἏἘἙἚἛἜἝἨἩἪἫἬἭἮἯἸἹἺἻἼἽἾἿὈὉὊὋὌὍὙὛὝὟὨὩὪὫὬὭὮὯᾸᾹᾺΆιῈΈῊΉῘῙῚΊῨῩῪΎῬῸΌῺΏΩKÅℲⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅬⅭⅮⅯↃⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⱠⱢⱣⱤⱧⱩⱫⱭⱮⱯⱰⱲⱵⱾⱿⲀⲂⲄⲆⲈⲊⲌⲎⲐⲒⲔⲖⲘⲚⲜⲞⲠⲢⲤⲦⲨⲪⲬⲮⲰⲲⲴⲶⲸⲺⲼⲾⳀⳂⳄⳆⳈⳊⳌⳎⳐⳒⳔⳖⳘⳚⳜⳞⳠⳢⳫⳭⳲꙀꙂꙄꙆꙈꙊꙌꙎꙐꙒꙔꙖꙘꙚꙜꙞꙠꙢꙤꙦꙨꙪꙬꚀꚂꚄꚆꚈꚊꚌꚎꚐꚒꚔꚖꚘꚚꜢꜤꜦꜨꜪꜬꜮꜲꜴꜶꜸꜺꜼꜾꝀꝂꝄꝆꝈꝊꝌꝎꝐꝒꝔꝖꝘꝚꝜꝞꝠꝢꝤꝦꝨꝪꝬꝮꝹꝻꝽꝾꞀꞂꞄꞆꞋꞍꞐꞒꞖꞘꞚꞜꞞꞠꞢꞤꞦꞨꞪꞫꞬꞭꞮꞰꞱꞲꞳꞴꞶꞸꞺꞼꞾꟂꟄꟅꟆꟇꟉꟵꭰꭱꭲꭳꭴꭵꭶꭷꭸꭹꭺꭻꭼꭽꭾꭿꮀꮁꮂꮃꮄꮅꮆꮇꮈꮉꮊꮋꮌꮍꮎꮏꮐꮑꮒꮓꮔꮕꮖꮗꮘꮙꮚꮛꮜꮝꮞꮟꮠꮡꮢꮣꮤꮥꮦꮧꮨꮩꮪꮫꮬꮭꮮꮯꮰꮱꮲꮳꮴꮵꮶꮷꮸꮹꮺꮻꮼꮽꮾꮿＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ𐐀𐐁𐐂𐐃𐐄𐐅𐐆𐐇𐐈𐐉𐐊𐐋𐐌𐐍𐐎𐐏𐐐𐐑𐐒𐐓𐐔𐐕𐐖𐐗𐐘𐐙𐐚𐐛𐐜𐐝𐐞𐐟𐐠𐐡𐐢𐐣𐐤𐐥𐐦𐐧𐒰𐒱𐒲𐒳𐒴𐒵𐒶𐒷𐒸𐒹𐒺𐒻𐒼𐒽𐒾𐒿𐓀𐓁𐓂𐓃𐓄𐓅𐓆𐓇𐓈𐓉𐓊𐓋𐓌𐓍𐓎𐓏𐓐𐓑𐓒𐓓𐲀𐲁𐲂𐲃𐲄𐲅𐲆𐲇𐲈𐲉𐲊𐲋𐲌𐲍𐲎𐲏𐲐𐲑𐲒𐲓𐲔𐲕𐲖𐲗𐲘𐲙𐲚𐲛𐲜𐲝𐲞𐲟𐲠𐲡𐲢𐲣𐲤𐲥𐲦𐲧𐲨𐲩𐲪𐲫𐲬𐲭𐲮𐲯𐲰𐲱𐲲𑢠𑢡𑢢𑢣𑢤𑢥𑢦𑢧𑢨𑢩𑢪𑢫𑢬𑢭𑢮𑢯𑢰𑢱𑢲𑢳𑢴𑢵𑢶𑢷𑢸𑢹𑢺𑢻𑢼𑢽𑢾𑢿𖹀𖹁𖹂𖹃𖹄𖹅𖹆𖹇𖹈𖹉𖹊𖹋𖹌𖹍𖹎𖹏𖹐𖹑𖹒𖹓𖹔𖹕𖹖𖹗𖹘𖹙𖹚𖹛𖹜𖹝𖹞𖹟𞤀𞤁𞤂𞤃𞤄𞤅𞤆𞤇𞤈𞤉𞤊𞤋𞤌𞤍𞤎𞤏𞤐𞤑𞤒𞤓𞤔𞤕𞤖𞤗𞤘𞤙𞤚𞤛𞤜𞤝𞤞𞤟𞤠𞤡',
    'abcdefghjklmnopqrstuvwxyzμàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþāăąćĉċčďđēĕėęěĝğġģĥħĩīĭįĳĵķĺļľŀłńņňŋōŏőœŕŗřśŝşšţťŧũūŭůűųŵŷÿźżžsɓƃƅɔƈɖɗƌǝəɛƒɠɣɩɨƙɯɲɵơƣƥʀƨʃƭʈưʊʋƴƶʒƹƽǆǆǉǉǌǌǎǐǒǔǖǘǚǜǟǡǣǥǧǩǫǭǯǳǳǵƕƿǹǻǽǿȁȃȅȇȉȋȍȏȑȓȕȗșțȝȟƞȣȥȧȩȫȭȯȱȳⱥȼƚⱦɂƀʉʌɇɉɋɍɏιͱͳͷϳάέήίόύώαβγδεζηθικλμνξοπρστυφχψωϊϋσϗβθφπϙϛϝϟϡϣϥϧϩϫϭϯκρθεϸϲϻͻͼͽѐёђѓєѕіїјљњћќѝўџабвгдежзийклмнопрстуфхцчшщъыьэюяѡѣѥѧѩѫѭѯѱѳѵѷѹѻѽѿҁҋҍҏґғҕҗҙқҝҟҡңҥҧҩҫҭүұҳҵҷҹһҽҿӏӂӄӆӈӊӌӎӑӓӕӗәӛӝӟӡӣӥӧөӫӭӯӱӳӵӷӹӻӽӿԁԃԅԇԉԋԍԏԑԓԕԗԙԛԝԟԡԣԥԧԩԫԭԯաբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆⴀⴁⴂⴃⴄⴅⴆⴇⴈⴉⴊⴋⴌⴍⴎⴏⴐⴑⴒⴓⴔⴕⴖⴗⴘⴙⴚⴛⴜⴝⴞⴟⴠⴡⴢⴣⴤⴥⴧⴭᏰᏱᏲᏳᏴᏵвдосттъѣꙋაბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰჱჲჳჴჵჶჷჸჹჺჽჾჿḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕṡạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹỻỽỿἀἁἂἃἄἅἆἇἐἑἒἓἔἕἠἡἢἣἤἥἦἧἰἱἲἳἴἵἶἷὀὁὂὃὄὅὑὓὕὗὠὡὢὣὤὥὦὧᾰᾱὰάιὲέὴήῐῑὶίῠῡὺύῥὸόὼώωkåⅎⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻⅼⅽⅾⅿↄⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱡɫᵽɽⱨⱪⱬɑɱɐɒⱳⱶȿɀⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱⲳⲵⲷⲹⲻⲽⲿⳁⳃⳅⳇⳉⳋⳍⳏⳑⳓⳕⳗⳙⳛⳝⳟⳡⳣⳬⳮⳳꙁꙃꙅꙇꙉꙋꙍꙏꙑꙓꙕꙗꙙꙛꙝꙟꙡꙣꙥꙧꙩꙫꙭꚁꚃꚅꚇꚉꚋꚍꚏꚑꚓꚕꚗꚙꚛꜣꜥꜧꜩꜫꜭꜯꜳꜵꜷꜹꜻꜽꜿꝁꝃꝅꝇꝉꝋꝍꝏꝑꝓꝕꝗꝙꝛꝝꝟꝡꝣꝥꝧꝩꝫꝭꝯꝺꝼᵹꝿꞁꞃꞅꞇꞌɥꞑꞓꞗꞙꞛꞝꞟꞡꞣꞥꞧꞩɦɜɡɬɪʞʇʝꭓꞵꞷꞹꞻꞽꞿꟃꞔʂᶎꟈꟊꟶᎠᎡᎢᎣᎤᎥᎦᎧᎨᎩᎪᎫᎬᎭᎮᎯᎰᎱᎲᎳᎴᎵᎶᎷᎸᎹᎺᎻᎼᎽᎾᎿᏀᏁᏂᏃᏄᏅᏆᏇᏈᏉᏊᏋᏌᏍᏎᏏᏐᏑᏒᏓᏔᏕᏖᏗᏘᏙᏚᏛᏜᏝᏞᏟᏠᏡᏢᏣᏤᏥᏦᏧᏨᏩᏪᏫᏬᏭᏮᏯａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ𐐨𐐩𐐪𐐫𐐬𐐭𐐮𐐯𐐰𐐱𐐲𐐳𐐴𐐵𐐶𐐷𐐸𐐹𐐺𐐻𐐼𐐽𐐾𐐿𐑀𐑁𐑂𐑃𐑄𐑅𐑆𐑇𐑈𐑉𐑊𐑋𐑌𐑍𐑎𐑏𐓘𐓙𐓚𐓛𐓜𐓝𐓞𐓟𐓠𐓡𐓢𐓣𐓤𐓥𐓦𐓧𐓨𐓩𐓪𐓫𐓬𐓭𐓮𐓯𐓰𐓱𐓲𐓳𐓴𐓵𐓶𐓷𐓸𐓹𐓺𐓻𐳀𐳁𐳂𐳃𐳄𐳅𐳆𐳇𐳈𐳉𐳊𐳋𐳌𐳍𐳎𐳏𐳐𐳑𐳒𐳓𐳔𐳕𐳖𐳗𐳘𐳙𐳚𐳛𐳜𐳝𐳞𐳟𐳠𐳡𐳢𐳣𐳤𐳥𐳦𐳧𐳨𐳩𐳪𐳫𐳬𐳭𐳮𐳯𐳰𐳱𐳲𑣀𑣁𑣂𑣃𑣄𑣅𑣆𑣇𑣈𑣉𑣊𑣋𑣌𑣍𑣎𑣏𑣐𑣑𑣒𑣓𑣔𑣕𑣖𑣗𑣘𑣙𑣚𑣛𑣜𑣝𑣞𑣟𖹠𖹡𖹢𖹣𖹤𖹥𖹦𖹧𖹨𖹩𖹪𖹫𖹬𖹭𖹮𖹯𖹰𖹱𖹲𖹳𖹴𖹵𖹶𖹷𖹸𖹹𖹺𖹻𖹼𖹽𖹾𖹿𞤢𞤣𞤤𞤥𞤦𞤧𞤨𞤩𞤪𞤫𞤬𞤭𞤮𞤯𞤰𞤱𞤲𞤳𞤴𞤵𞤶𞤷𞤸𞤹𞤺𞤻𞤼𞤽𞤾𞤿𞥀𞥁𞥂𞥃'
  );
  FOR mapping_index IN 1..pg_catalog.array_length(multi_source, 1) LOOP
    folded := pg_catalog.replace(folded, multi_source[mapping_index], multi_target[mapping_index]);
  END LOOP;
  RETURN pg_catalog.normalize(folded, 'NFC');
END
$function$;

CREATE FUNCTION saas.catalog_product_title_sort_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.replace(saas.catalog_product_search_key(p_value), 'ç', 'c~'),
            'ğ', 'g~'
          ),
          'ı', 'h~'
        ),
        'ö', 'o~'
      ),
      'ş', 's~'
    ),
    'ü', 'u~'
  );
$function$;

REVOKE ALL ON FUNCTION saas.catalog_product_search_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_product_title_sort_key(text) FROM PUBLIC;

CREATE FUNCTION saas.catalog_list_products_v3(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_search text,
  p_status text,
  p_stock text,
  p_category_id uuid,
  p_brand_id uuid,
  p_collection_id uuid,
  p_sort text,
  p_page_size integer,
  p_cursor_timestamp timestamptz,
  p_cursor_title text,
  p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  normalized_search text;
  listed_items jsonb;
  listed_count integer;
  catalog_total bigint;
  featured_images jsonb;
  variant_summaries jsonb;
  cursor_anchor jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  normalized_search := saas.catalog_product_search_key(pg_catalog.btrim(p_search));
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
     OR (p_search IS NOT NULL AND (
       pg_catalog.char_length(pg_catalog.btrim(p_search)) > 200
       OR pg_catalog.btrim(p_search) ~ '[[:cntrl:]]'
     ))
     OR (p_status IS NOT NULL AND p_status NOT IN ('draft', 'active', 'archived'))
     OR (p_stock IS NOT NULL AND p_stock NOT IN ('in-stock', 'out-of-stock', 'untracked'))
     OR p_sort IS NULL
     OR p_sort NOT IN ('updated-desc', 'title-asc', 'title-desc', 'created-desc', 'created-asc')
     OR NOT (
       (p_cursor_id IS NULL AND p_cursor_timestamp IS NULL AND p_cursor_title IS NULL)
       OR (
         p_cursor_id IS NOT NULL
         AND p_sort IN ('updated-desc', 'created-desc', 'created-asc')
         AND p_cursor_timestamp IS NOT NULL
         AND p_cursor_title IS NULL
       )
       OR (
         p_cursor_id IS NOT NULL
         AND p_sort IN ('title-asc', 'title-desc')
         AND p_cursor_timestamp IS NULL
         AND p_cursor_title IS NOT NULL
         AND p_cursor_title = pg_catalog.btrim(p_cursor_title)
         AND pg_catalog.char_length(p_cursor_title) BETWEEN 1 AND 200
         AND p_cursor_title !~ '[[:cntrl:]]'
       )
     ) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF normalized_search = '' THEN normalized_search := NULL; END IF;

  SELECT pg_catalog.count(*)
  INTO catalog_total
  FROM saas.products AS product
  WHERE product.store_id = p_store_id;

  WITH selected AS MATERIALIZED (
    SELECT
      product.id,
      product.title AS cursor_title,
      product.created_at,
      product.updated_at,
      saas.catalog_product_search_key(product.title) AS title_key,
      saas.catalog_product_title_sort_key(product.title) AS title_sort_key,
      variant.id AS variant_id,
      variant.store_id AS variant_store_id,
      variant.sku AS variant_sku,
      variant.price_cents AS variant_price_cents,
      variant.compare_at_cents AS variant_compare_at_cents,
      variant.stock_tracking AS variant_stock_tracking,
      variant.stock_quantity AS variant_stock_quantity
    FROM saas.products AS product
    LEFT JOIN LATERAL (
      SELECT
        variant.id,
        variant.store_id,
        variant.sku,
        variant.price_cents,
        variant.compare_at_cents,
        variant.stock_tracking,
        variant.stock_quantity
      FROM saas.product_variants AS variant
      WHERE variant.product_id = product.id
        AND variant.store_id = p_store_id
      ORDER BY
        CASE WHEN variant.status = 'active' THEN 0 ELSE 1 END,
        variant.created_at ASC,
        variant.id ASC
      LIMIT 1
    ) AS variant ON true
    WHERE product.store_id = p_store_id
      AND (
        (p_status IS NULL AND product.status <> 'archived')
        OR product.status = p_status
      )
      AND (
        normalized_search IS NULL
        OR pg_catalog.strpos(saas.catalog_product_search_key(product.title), normalized_search) > 0
        OR pg_catalog.strpos(saas.catalog_product_search_key(product.slug), normalized_search) > 0
        OR EXISTS (
          SELECT 1
          FROM saas.product_variants AS searched_variant
          WHERE searched_variant.store_id = p_store_id
            AND searched_variant.product_id = product.id
            AND (
              pg_catalog.strpos(saas.catalog_product_search_key(searched_variant.sku), normalized_search) > 0
              OR pg_catalog.strpos(saas.catalog_product_search_key(searched_variant.barcode), normalized_search) > 0
            )
        )
      )
      AND (
        p_stock IS NULL
        OR (p_stock = 'in-stock' AND variant.stock_tracking AND variant.stock_quantity > 0)
        OR (p_stock = 'out-of-stock' AND variant.stock_tracking AND variant.stock_quantity = 0)
        OR (p_stock = 'untracked' AND NOT variant.stock_tracking)
      )
      AND (
        p_category_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM saas.catalog_product_categories AS assignment
          JOIN saas.catalog_categories AS category
            ON category.store_id = assignment.store_id
           AND category.id = assignment.category_id
           AND category.status = 'active'
          WHERE assignment.store_id = p_store_id
            AND assignment.product_id = product.id
            AND assignment.category_id = p_category_id
        )
      )
      AND (
        p_brand_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM saas.catalog_admin_resource_products AS assignment
          JOIN saas.catalog_admin_resources AS resource
            ON resource.store_id = assignment.store_id
           AND resource.id = assignment.resource_id
           AND resource.resource_kind = 'brand'
           AND resource.status = 'active'
          WHERE assignment.store_id = p_store_id
            AND assignment.product_id = product.id
            AND assignment.resource_id = p_brand_id
        )
      )
      AND (
        p_collection_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM saas.catalog_admin_resource_products AS assignment
          JOIN saas.catalog_admin_resources AS resource
            ON resource.store_id = assignment.store_id
           AND resource.id = assignment.resource_id
           AND resource.resource_kind = 'collection'
           AND resource.status = 'active'
          WHERE assignment.store_id = p_store_id
            AND assignment.product_id = product.id
            AND assignment.resource_id = p_collection_id
        )
      )
      AND (
        p_cursor_id IS NULL
        OR (p_sort = 'updated-desc' AND (product.updated_at, product.id) < (p_cursor_timestamp, p_cursor_id))
        OR (p_sort = 'created-desc' AND (product.created_at, product.id) < (p_cursor_timestamp, p_cursor_id))
        OR (p_sort = 'created-asc' AND (product.created_at, product.id) > (p_cursor_timestamp, p_cursor_id))
        OR (
          p_sort = 'title-asc'
          AND (saas.catalog_product_title_sort_key(product.title), product.id)
            > (saas.catalog_product_title_sort_key(p_cursor_title), p_cursor_id)
        )
        OR (
          p_sort = 'title-desc'
          AND (saas.catalog_product_title_sort_key(product.title), product.id)
            < (saas.catalog_product_title_sort_key(p_cursor_title), p_cursor_id)
        )
      )
    ORDER BY
      CASE WHEN p_sort = 'updated-desc' THEN product.updated_at END DESC,
      CASE WHEN p_sort = 'updated-desc' THEN product.id END DESC,
      CASE WHEN p_sort = 'title-asc' THEN saas.catalog_product_title_sort_key(product.title) END ASC,
      CASE WHEN p_sort = 'title-asc' THEN product.id END ASC,
      CASE WHEN p_sort = 'title-desc' THEN saas.catalog_product_title_sort_key(product.title) END DESC,
      CASE WHEN p_sort = 'title-desc' THEN product.id END DESC,
      CASE WHEN p_sort = 'created-desc' THEN product.created_at END DESC,
      CASE WHEN p_sort = 'created-desc' THEN product.id END DESC,
      CASE WHEN p_sort = 'created-asc' THEN product.created_at END ASC,
      CASE WHEN p_sort = 'created-asc' THEN product.id END ASC
    LIMIT p_page_size + 1
  ), page AS MATERIALIZED (
    SELECT *
    FROM selected
    ORDER BY
      CASE WHEN p_sort = 'updated-desc' THEN updated_at END DESC,
      CASE WHEN p_sort = 'updated-desc' THEN id END DESC,
      CASE WHEN p_sort = 'title-asc' THEN title_sort_key END ASC,
      CASE WHEN p_sort = 'title-asc' THEN id END ASC,
      CASE WHEN p_sort = 'title-desc' THEN title_sort_key END DESC,
      CASE WHEN p_sort = 'title-desc' THEN id END DESC,
      CASE WHEN p_sort = 'created-desc' THEN created_at END DESC,
      CASE WHEN p_sort = 'created-desc' THEN id END DESC,
      CASE WHEN p_sort = 'created-asc' THEN created_at END ASC,
      CASE WHEN p_sort = 'created-asc' THEN id END ASC
    LIMIT p_page_size
  ), projected AS MATERIALIZED (
    SELECT
      page.*,
      saas.catalog_product_projection(page.id) AS product,
      (
        SELECT pg_catalog.jsonb_build_object(
          'publicUrl', media.public_url,
          'altText', media.alt_text
        )
        FROM saas.product_media AS media
        WHERE media.store_id = p_store_id
          AND media.product_id = page.id
          AND media.status = 'active'
        ORDER BY media.sort_order, media.id
        LIMIT 1
      ) AS featured_image,
      CASE WHEN page.variant_id IS NULL THEN NULL ELSE pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'productId', page.id,
          'storeId', page.variant_store_id,
          'variantId', page.variant_id,
          'sku', page.variant_sku,
          'priceCents', page.variant_price_cents,
          'compareAtCents', page.variant_compare_at_cents,
          'stockTracking', page.variant_stock_tracking,
          'stockQuantity', page.variant_stock_quantity
        )
      ) END AS variant_summary
    FROM page
  )
  SELECT
    COALESCE(
      pg_catalog.jsonb_agg(
        projected.product
        ORDER BY
          CASE WHEN p_sort = 'updated-desc' THEN projected.updated_at END DESC,
          CASE WHEN p_sort = 'updated-desc' THEN projected.id END DESC,
          CASE WHEN p_sort = 'title-asc' THEN projected.title_sort_key END ASC,
          CASE WHEN p_sort = 'title-asc' THEN projected.id END ASC,
          CASE WHEN p_sort = 'title-desc' THEN projected.title_sort_key END DESC,
          CASE WHEN p_sort = 'title-desc' THEN projected.id END DESC,
          CASE WHEN p_sort = 'created-desc' THEN projected.created_at END DESC,
          CASE WHEN p_sort = 'created-desc' THEN projected.id END DESC,
          CASE WHEN p_sort = 'created-asc' THEN projected.created_at END ASC,
          CASE WHEN p_sort = 'created-asc' THEN projected.id END ASC
      ),
      '[]'::jsonb
    ),
    (SELECT pg_catalog.count(*)::integer FROM selected),
    COALESCE(
      pg_catalog.jsonb_object_agg(projected.id::text, projected.featured_image)
        FILTER (WHERE projected.featured_image IS NOT NULL),
      '{}'::jsonb
    ),
    COALESCE(
      pg_catalog.jsonb_object_agg(projected.id::text, projected.variant_summary)
        FILTER (WHERE projected.variant_summary IS NOT NULL),
      '{}'::jsonb
    ),
    CASE WHEN (SELECT pg_catalog.count(*) FROM selected) > p_page_size THEN (
      SELECT pg_catalog.jsonb_build_object(
        'timestamp', CASE
          WHEN p_sort = 'updated-desc' THEN saas.catalog_timestamp(cursor_row.updated_at)
          WHEN p_sort IN ('created-desc', 'created-asc') THEN saas.catalog_timestamp(cursor_row.created_at)
          ELSE NULL
        END,
        'title', CASE WHEN p_sort IN ('title-asc', 'title-desc') THEN cursor_row.cursor_title ELSE NULL END,
        'id', cursor_row.id
      )
      FROM projected AS cursor_row
      ORDER BY
        CASE WHEN p_sort = 'updated-desc' THEN cursor_row.updated_at END ASC,
        CASE WHEN p_sort = 'updated-desc' THEN cursor_row.id END ASC,
        CASE WHEN p_sort = 'title-asc' THEN cursor_row.title_sort_key END DESC,
        CASE WHEN p_sort = 'title-asc' THEN cursor_row.id END DESC,
        CASE WHEN p_sort = 'title-desc' THEN cursor_row.title_sort_key END ASC,
        CASE WHEN p_sort = 'title-desc' THEN cursor_row.id END ASC,
        CASE WHEN p_sort = 'created-desc' THEN cursor_row.created_at END ASC,
        CASE WHEN p_sort = 'created-desc' THEN cursor_row.id END ASC,
        CASE WHEN p_sort = 'created-asc' THEN cursor_row.created_at END DESC,
        CASE WHEN p_sort = 'created-asc' THEN cursor_row.id END DESC
      LIMIT 1
    ) ELSE NULL END
  INTO listed_items, listed_count, featured_images, variant_summaries, cursor_anchor
  FROM projected;

  RETURN QUERY SELECT 'listed'::text, pg_catalog.jsonb_build_object(
    'items', listed_items,
    'hasMore', listed_count > p_page_size,
    'catalogTotal', catalog_total,
    'cursorAnchor', cursor_anchor,
    'featuredImages', featured_images,
    'variantSummaries', variant_summaries
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid) TO celebix_saas_app;

COMMIT;
