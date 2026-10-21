// 评论对话树 (视频页 / 动态详情页共用)
//
// ── B 站的评论是"对话树" ────────────────────────────────────────────────
// 一级评论 → 二级评论(回复一级) → 三级评论(回复二级) → …
//
// 评论条目的关键字段 (见 API 文档 docs/comment/readme.md):
//   root   根评论 rpid; 一级评论为 0
//   parent 回复的父评论 rpid
//          一级评论 = 0
//          二级评论 = 根评论 rpid
//          三级及以上 = 上一级评论的 rpid
//   rcount 该评论下的回复条数
//
// 子评论接口 GET /x/v2/reply/reply?root=<根评论rpid> 返回的 data.replies
// 文档上叫"评论对话树列表", 实际见过两种形态:
//
//   ① 平铺: 每条带 parent, 靠 parent 串成树
//      [{rpid:2, parent:1}, {rpid:3, parent:1}, {rpid:4, parent:2}]
//   ② 嵌套: 每条自带 replies 数组 (递归嵌套)
//      [{rpid:2, parent:1, replies:[{rpid:4, parent:2}]}]
//
// 两种都要能处理, 所以这里先递归拍平, 再按 parent 建树 —— 只按嵌套展开的话,
// 遇到平铺的响应就会把所有回复都当成同一层 (多层级评论显示错位的根因)。

/**
 * 递归收集所有评论条目, 把嵌套形态拍平成一个列表
 *
 * @param {any[]} nodes 接口返回的原始列表
 * @param {any[]} [out] 收集结果 (递归时复用)
 * @returns {any[]}
 */
export function flattenCommentNodes(nodes, out) {
  const list = out || [];
  if (!nodes || !nodes.length) return list;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || !n.rpid) continue;
    list.push(n);
    if (n.replies && n.replies.length) flattenCommentNodes(n.replies, list);
  }
  return list;
}

/**
 * 按 parent 字段建对话树, 返回带层级(depth)的有序列表
 *
 * depth = 0 是根评论的直属回复 (B 站说的"二级评论"), 每往下一层 +1。
 *
 * @param {any[]} nodes 接口返回的原始列表 (平铺或嵌套都行)
 * @param {number|string} rootRpid 根评论 rpid
 * @param {string} [rootAuthor] 根评论作者名 (给直接回复根评论的人显示"回复 @某某")
 * @returns {Array<{node: any, depth: number, replyName: string}>}
 */
export function buildCommentTree(nodes, rootRpid, rootAuthor) {
  const flat = flattenCommentNodes(nodes || []);
  const root = Number(rootRpid) || 0;

  /** @type {Record<string, any>} rpid -> 评论条目 */
  const byRpid = {};
  for (let i = 0; i < flat.length; i++) byRpid[flat[i].rpid] = flat[i];

  // parent -> 子评论列表
  /** @type {Record<string, any[]>} */
  const childrenOf = {};
  // parent 找不到的 (指向根评论 / 指向列表外的祖先) → 当成根评论的直属回复
  const tops = [];

  for (let i = 0; i < flat.length; i++) {
    const n = flat[i];
    // 根评论本身不该出现在回复列表里 (接口把它放在 data.root),
    // 万一混进来了也不能重复渲染一遍
    if (Number(n.rpid) === root) continue;
    const parent = Number(n.parent) || 0;
    if (!parent || parent === root || !byRpid[parent]) {
      tops.push(n);
    } else {
      if (!childrenOf[parent]) childrenOf[parent] = [];
      childrenOf[parent].push(n);
    }
  }

  const out = [];
  const seen = {};

  /**
   * @param {any} node
   * @param {number} depth
   */
  const walk = (node, depth) => {
    if (!node || seen[node.rpid]) return; // 防御: 接口数据里出现环时不至于死循环
    seen[node.rpid] = true;

    // 「回复 @某某」用 parent 反查作者, 不用正则去正文里抠 ——
    // 正文里的 @ 是用户自己打的, 正则抠出来的名字经常是错的
    let replyName = '';
    const parent = Number(node.parent) || 0;
    if (parent) {
      const p = byRpid[parent];
      if (p && p.member) replyName = p.member.uname || '';
      else if (parent === root) replyName = rootAuthor || '';
    }

    out.push({ node: node, depth: depth, replyName: replyName });

    const kids = childrenOf[node.rpid] || [];
    for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
  };

  for (let i = 0; i < tops.length; i++) walk(tops[i], 0);

  return out;
}
