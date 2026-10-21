// Deterministic title/available-summary proxy. No IDs, labels or outcomes as inputs.
export const ruleVersion = 'news4-rules-v1';
export const ruleKeys = ['H1','A1:海外','C:间接（国家竞争、产业前景）','C:无','E:与中国无关','F:焦虑','F:中性'];
const china = /余额宝|中植|北大荒|长鑫|宇树|一汽|广汽|清华|李嘉诚|熊猫债|赴港|境内|国资|央国企|港交所|证监会|国家金融监管|财政部|人民银行|问界|Shein|Temu|iQiyi|Unitree|CXMT|QDII|中国|中方|中企|中资|国内|内地|国产|我国|大陆|对华|在华|赴华|来华|输华|香港|澳门|北京|上海|深圳|广州|杭州|武汉|合肥|天津|成都|重庆|南京|苏州|济南|山东|江苏|浙江|广东|中国央行|国务院|商务部|国家统计局|A股|港股|沪深|人民币|华为|小米|比亚迪|阿里巴巴|阿里|腾讯|字节跳动|抖音|京东|拼多多|美团|百度|快手|小红书|哔哩哔哩|滴滴|携程|深度求索|大疆|中芯国际|宁德时代|吉利|蔚来|小鹏|理想汽车|长城汽车|长安汽车|上汽|茅台|蜜雪冰城|瑞幸|泡泡玛特|安踏|李宁|海尔|美的|格力|万科|恒大|碧桂园|融创|阳光电源|中兴|联想|复星|农夫山泉|娃哈哈|工商银行|招商银行|中国平安|中国人寿|中石油|中石化|\b(?:china|chinese|beijing|shanghai|shenzhen|hong kong|renminbi|yuan|huawei|xiaomi|byd|alibaba|tencent|bytedance|tiktok|deepseek|pinduoduo|meituan|baidu|geely|nio|xpeng|ant group|sungrow)\b/iu;
const foreign = /美日|美伊|韩股|纳斯达克|纳指|道琼斯|标普|SpaceX|Aspect|CFM|Qualcomm|高通|美国|美联储|美股|美债|美方|美元|对美|赴美|美企|特朗普|马斯克|鲍威尔|英伟达|苹果|特斯拉|微软|谷歌|亚马逊|脸书|扎克伯格|甲骨文|奈飞|高盛|摩根|黑石|巴菲特|沃尔玛|麦当劳|可口可乐|星巴克|耐克|埃克森|日本|日元|日本央行|日企|丰田|本田|索尼|软银|韩国|三星|SK海力士|欧洲|欧盟|英国|德国|法国|意大利|瑞士|俄罗斯|印度|越南|巴西|加拿大|澳大利亚|印尼|印度尼西亚|新加坡|马来西亚|泰国|沙特|以色列|伊朗|中东|墨西哥|土耳其|非洲|台积电|台湾|鸿海|联发科|南非|奔驰|宝马|大众汽车|阿斯麦|诺和诺德|\b(?:US|U\.S\.|United States|American|Japan|Japanese|Korea|Samsung|Europe|European|Britain|UK|Germany|France|India|Vietnam|Canada|Australia|Singapore|Taiwan|TSMC|Trump|Musk|Nvidia|Apple|Tesla|Microsoft|Google|Amazon|Meta|OpenAI|ChatGPT|Oracle|Netflix|Walmart|Goldman|JPMorgan|BlackRock|ASML|Volkswagen)\b/iu;
const consumer = /手机|汽车|电动车|新能源车|消费者|用户|居民|家庭|房贷|房价|住房|租房|房租|机票|票价|航班|订阅|套餐|电费|油价|燃油|食品|药品|医疗|医保|教育|学费|养老金|社保|工资|就业|失业|裁员|\b(?:consumer|customer|household|rent|mortgage|wage|salary|pension|fare|subscription|iPhone|car prices)\b/iu;
const serviceChange = /涨价|降价|价格|售价|收费|费用|票价|上调|下调|上涨|下跌|下滑|下降|提高|降低|减免|取消|停飞|开通|暂停|停止|免费|补贴|裁员|失业|退休|延迟退休|医保|社保|工资|就业|\b(?:price|cost|fee|rise|rises|raise|raises|cut|cuts|increase|decrease|layoff|job|wage)\b/iu;
const investment = /股价|股市|股票|基金|债券|理财|收益率|市值|持仓|\b(?:stock|share|bond|fund|yield|market cap)\b/iu;
const anxiety = /转亏|失守|微利|告急|拖累|补缴|滞纳金|弃购|增收不增利|净流出|被撤|下挫|忧虑|踩踏|抛售|首降|降至|降[0-9]|就业.{0,20}冰火两重天|招聘.{0,20}冰火两重天|生存保障.{0,10}冰火两重天|管理费.{0,10}锁定期|下滑|下降|下跌|暴跌|大跌|亏损|赤字|失业|裁员|停工|破产|违约|削减|损失|担忧|恐慌|警告|风险|危机|压力|疲软|萎缩|竞争加剧|关停|停产|中断|禁止|禁令|限制|受限|封禁|加征|征收|制裁|施压|压制|打击|衰退|短缺|崩溃|成本.{0,8}(增加|上涨|飙升)|威胁|不确定|\b(?:fall|falls|falling|decline|declines|drop|drops|slump|loss|losses|risk|risks|threat|threats|ban|bans|curb|curbs|restriction|restrictions|layoffs|job cuts|worries|fears|warns|weak|crisis|default|bankrupt|downturn|slowdown)\b/iu;
const pride = /领先|突破|胜出|领跑|超越|登顶|全球第一|世界第一|首个|首次|创纪录|国产替代|\b(?:breakthrough|world.first|record.high|overtake|overtakes|lead|leads)\b/iu;
const misconduct = /诈骗|欺诈|贿赂|腐败|侵权|过期食品|侵犯|不公平|违法|违规|\b(?:fraud|scam|bribery|corruption|unfair|illegal)\b/iu;
const victim = /消费者|客户|员工|用户|股东|投资者|劳动者|工人|居民|\b(?:consumer|customer|employee|worker|investor|victim)\b/iu;

export function classify(input) {
  if (!input || (input.title != null && typeof input.title !== 'string') || (input.summary != null && typeof input.summary !== 'string')) throw new TypeError('title/summary must be strings or missing');
  const text = [input.title, input.summary].filter(x => typeof x === 'string' && x.trim()).join('\n').normalize('NFKC');
  if (!text.trim()) return {ruleVersion, labels:{A1:null,C:null,E:null,F:null}, rules:Object.fromEntries(ruleKeys.map(k => [k,null])), evidence:{inputMissing:true}};
  const fr = foreign.test(text);
  const macro = /财政收入|各省|全国|工业增加值|统计局|居民存款|失业率|在校生|制造业PMI|GDP|CPI|PPI|出口同比|进口超预期|主管部门|私募/.test(text);
  const cn = china.test(text) || (macro && !fr);
  const aggregateOnly = /失业率|GDP|CPI|PPI|工业增加值|统计局|财政收入|制造业PMI/.test(text);
  const direct = !aggregateOnly && consumer.test(text) && serviceChange.test(text) && (cn || /售价|价格|票价|订阅|机票|套餐|收费|涨价|降价|停飞|开通|\b(?:price|fare|subscription)\b/iu.test(text)) && (!investment.test(text) || /工资|就业|裁员|房贷|房租|机票|订阅|养老金|医保|社保/.test(text));
  const fi = text.search(foreign), ci = text.search(china);
  const foreignLeads = fr && fi >= 0 && (ci < 0 || fi < ci);
  const bilateralAction = /对华|对中国|中美|美中|双方|双边|会晤|会谈|制裁|反制|关税|谈判|与.{0,16}合作|deal with/iu.test(text);
  const speech = /称|认为|呼吁|不应|表示|says|urges/iu.test(text);
  const A1 = cn && fr ? (foreignLeads && (!bilateralAction || speech) ? '海外' : '中外双方') : cn ? '国内' : fr ? '海外' : null;
  const C = direct ? '直接（钱包、工作、生活）' : cn ? '间接（国家竞争、产业前景）' : '无';
  const E = cn ? '涉及中国（非完整E分类）' : '与中国无关';
  const riskText = text.replace(/(?:不应|不会|不再|避免|防止|没有|并未).{0,4}(?:封禁|禁止|限制|裁员|亏损|下滑)/gu, '');
  const F = misconduct.test(text) && victim.test(text) ? '愤怒或不公' : anxiety.test(riskText) ? '焦虑' : cn && pride.test(text) ? '自豪' : '中性';
  const rules = {'H1': A1 === null ? null : A1 === '海外' && !cn, 'A1:海外':A1 === null ? null : A1 === '海外', 'C:间接（国家竞争、产业前景）':C === '间接（国家竞争、产业前景）', 'C:无':C === '无', 'E:与中国无关':!cn, 'F:焦虑':F === '焦虑', 'F:中性':F === '中性'};
  return {ruleVersion,labels:{A1,C,E,F},rules,evidence:{chinaCue:cn,foreignCue:fr,consumerCue:consumer.test(text),directCue:direct,anxietyCue:anxiety.test(riskText),prideCue:cn&&pride.test(text)}};
}
