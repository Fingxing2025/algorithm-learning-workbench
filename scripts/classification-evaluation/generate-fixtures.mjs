import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { format } from 'prettier'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const fixtureRoot = resolve(repositoryRoot, 'tests/fixtures/classification-evaluation')
const sourceRoot = resolve(fixtureRoot, 'sources')

const categories = [
  'basic',
  'basic.discretization.coordinate-compression',
  'basic.greedy',
  'basic.prefix',
  'basic.search',
  'basic.search.backtracking',
  'basic.search.binary',
  'contest',
  'contest.io',
  'contest.io.fast',
  'cpp',
  'cpp.debug.memory-representation',
  'cpp.integer.int128',
  'cpp.stl',
  'cpp.stl.containers',
  'data-structure',
  'data-structure.fenwick',
  'data-structure.range-query.sparse-table',
  'data-structure.segment-tree',
  'data-structure.tree',
  'data-structure.union-find',
  'datetime',
  'datetime.calendar',
  'datetime.calendar.convert',
  'dp',
  'dp.knapsack',
  'dp.knapsack.01',
  'dp.knapsack.bounded',
  'dp.knapsack.dependent',
  'dp.knapsack.group',
  'dp.knapsack.unbounded',
  'dp.sequence',
  'dp.sequence.lis',
  'graph',
  'graph.mst',
  'graph.representation.forward-star',
  'graph.shortest-path',
  'graph.shortest-path.all-pairs',
  'graph.shortest-path.single-source',
  'graph.topological-sort',
  'graph.tree-query',
  'graph.tree-query.lca',
  'math',
  'math.combinatorics.factorial-inverse',
  'math.linear-algebra.xor-basis',
  'math.number-theory',
  'math.number-theory.prime',
  'math.polynomial.ntt',
  'math.precision.big-integer',
  'numeric',
  'numeric.root',
  'numeric.root.binary-trinary',
  'string',
  'string.palindrome.manacher',
  'string.pattern',
  'string.pattern.ac-automaton',
  'string.pattern.kmp',
  'string.pattern.z-function',
  'string.rotation.minimal',
  'string.suffix-array',
  'string.transform',
  'string.transform.bwt',
  'string.trie',
]

const single = (primaryCategoryId, ambiguity = 'low') => ({
  ambiguity,
  kind: 'single',
  primaryCategoryId,
})
const composite = (...componentCategoryIds) => ({
  ambiguity: 'high',
  componentCategoryIds,
  kind: 'composite',
})
const unknown = { ambiguity: 'high', kind: 'unknown' }

const bases = [
  {
    id: 'binary-search-lower-bound',
    split: 'development',
    family: 'basic',
    gold: single('basic.search.binary'),
    fileName: 'lower_bound.cpp',
    source: String.raw`#include <vector>
int lower_bound_index(const std::vector<int>& a, int target) {
  int left = 0, right = static_cast<int>(a.size());
  while (left < right) {
    int middle = left + (right - left) / 2;
    if (a[middle] < target) left = middle + 1;
    else right = middle;
  }
  return left;
}
int main() { return lower_bound_index({1, 3, 5, 8}, 5) == 2 ? 0 : 1; }
`,
  },
  {
    id: 'prefix-range-sum',
    split: 'development',
    family: 'basic',
    gold: single('basic.prefix'),
    fileName: '区间前缀和.cpp',
    source: String.raw`#include <vector>
struct PrefixSum {
  std::vector<long long> prefix;
  explicit PrefixSum(const std::vector<int>& values) : prefix(values.size() + 1) {
    for (std::size_t i = 0; i < values.size(); ++i) prefix[i + 1] = prefix[i] + values[i];
  }
  long long query(int left, int right) const { return prefix[right + 1] - prefix[left]; }
};
int main() { return PrefixSum({2, 4, 8}).query(1, 2) == 12 ? 0 : 1; }
`,
  },
  {
    id: 'coordinate-compression',
    split: 'development',
    family: 'basic',
    gold: single('basic.discretization.coordinate-compression'),
    fileName: '坐标压缩.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
std::vector<int> compress(const std::vector<int>& input) {
  std::vector<int> ordered = input;
  std::sort(ordered.begin(), ordered.end());
  ordered.erase(std::unique(ordered.begin(), ordered.end()), ordered.end());
  std::vector<int> ranks;
  for (int value : input) ranks.push_back(std::lower_bound(ordered.begin(), ordered.end(), value) - ordered.begin());
  return ranks;
}
int main() { return compress({50, 10, 50, 30}) == std::vector<int>({2, 0, 2, 1}) ? 0 : 1; }
`,
  },
  {
    id: 'dijkstra-priority-queue',
    split: 'development',
    family: 'graph',
    gold: single('graph.shortest-path.single-source'),
    fileName: 'dijkstra.cpp',
    source: String.raw`#include <functional>
#include <limits>
#include <queue>
#include <utility>
#include <vector>
std::vector<int> dijkstra(const std::vector<std::vector<std::pair<int, int>>>& graph, int source) {
  std::vector<int> distance(graph.size(), std::numeric_limits<int>::max());
  using State = std::pair<int, int>;
  std::priority_queue<State, std::vector<State>, std::greater<State>> queue;
  distance[source] = 0; queue.push({0, source});
  while (!queue.empty()) {
    auto [cost, node] = queue.top(); queue.pop();
    if (cost != distance[node]) continue;
    for (auto [next, weight] : graph[node]) if (cost + weight < distance[next]) {
      distance[next] = cost + weight; queue.push({distance[next], next});
    }
  }
  return distance;
}
int main() { std::vector<std::vector<std::pair<int,int>>> g(2); g[0].push_back({1, 7}); return dijkstra(g, 0)[1] == 7 ? 0 : 1; }
`,
  },
  {
    id: 'kruskal-edge-sort',
    split: 'development',
    family: 'graph',
    gold: single('graph.mst'),
    fileName: 'kruskal.cpp',
    source: String.raw`#include <algorithm>
#include <numeric>
#include <vector>
struct Edge { int from, to, weight; };
struct DisjointSet {
  std::vector<int> parent;
  explicit DisjointSet(int n) : parent(n) { std::iota(parent.begin(), parent.end(), 0); }
  int find(int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); }
  bool unite(int a, int b) { a = find(a); b = find(b); if (a == b) return false; parent[a] = b; return true; }
};
int kruskal(int n, std::vector<Edge> edges) {
  std::sort(edges.begin(), edges.end(), [](const Edge& a, const Edge& b) { return a.weight < b.weight; });
  DisjointSet dsu(n); int total = 0;
  for (const Edge& edge : edges) if (dsu.unite(edge.from, edge.to)) total += edge.weight;
  return total;
}
int main() { return kruskal(3, {{0,1,4},{1,2,2},{0,2,9}}) == 6 ? 0 : 1; }
`,
  },
  {
    id: 'fenwick-point-add-range-sum',
    split: 'development',
    family: 'data-structure',
    gold: single('data-structure.fenwick'),
    fileName: 'fenwick.cpp',
    source: String.raw`#include <vector>
class Fenwick {
  std::vector<long long> tree;
public:
  explicit Fenwick(int n) : tree(n + 1) {}
  void add(int index, int delta) { for (; index < static_cast<int>(tree.size()); index += index & -index) tree[index] += delta; }
  long long prefix(int index) const { long long sum = 0; for (; index > 0; index -= index & -index) sum += tree[index]; return sum; }
  long long range(int left, int right) const { return prefix(right) - prefix(left - 1); }
};
int main() { Fenwick bit(5); bit.add(2, 3); bit.add(4, 5); return bit.range(2, 4) == 8 ? 0 : 1; }
`,
  },
  {
    id: 'segment-tree-lazy-sum',
    split: 'development',
    family: 'data-structure',
    gold: single('data-structure.segment-tree'),
    fileName: '懒标记线段树.cpp',
    source: String.raw`#include <vector>
class SegmentTree {
  int size; std::vector<long long> tree, lazy;
  void apply(int node, int left, int right, long long value) { tree[node] += value * (right - left + 1); lazy[node] += value; }
  void push(int node, int left, int right) { if (!lazy[node] || left == right) return; int middle = (left + right) / 2; apply(node*2,left,middle,lazy[node]); apply(node*2+1,middle+1,right,lazy[node]); lazy[node]=0; }
  void add(int node,int left,int right,int ql,int qr,int value) { if (ql<=left && right<=qr) return apply(node,left,right,value); push(node,left,right); int middle=(left+right)/2; if(ql<=middle)add(node*2,left,middle,ql,qr,value); if(qr>middle)add(node*2+1,middle+1,right,ql,qr,value); tree[node]=tree[node*2]+tree[node*2+1]; }
  long long sum(int node,int left,int right,int ql,int qr) { if(ql<=left&&right<=qr)return tree[node]; push(node,left,right); int middle=(left+right)/2; long long answer=0; if(ql<=middle)answer+=sum(node*2,left,middle,ql,qr); if(qr>middle)answer+=sum(node*2+1,middle+1,right,ql,qr); return answer; }
public:
  explicit SegmentTree(int n):size(n),tree(n*4),lazy(n*4){}
  void add(int left,int right,int value){add(1,0,size-1,left,right,value);} long long sum(int left,int right){return sum(1,0,size-1,left,right);}
};
int main(){SegmentTree tree(5);tree.add(1,3,4);return tree.sum(0,4)==12?0:1;}
`,
  },
  {
    id: 'kmp-prefix-function',
    split: 'development',
    family: 'string',
    gold: single('string.pattern.kmp'),
    fileName: 'KMP.cpp',
    source: String.raw`#include <string>
#include <vector>
std::vector<int> prefix_function(const std::string& pattern) {
  std::vector<int> pi(pattern.size());
  for (std::size_t i = 1; i < pattern.size(); ++i) {
    int j = pi[i - 1];
    while (j > 0 && pattern[i] != pattern[j]) j = pi[j - 1];
    if (pattern[i] == pattern[j]) ++j;
    pi[i] = j;
  }
  return pi;
}
int find_pattern(const std::string& text, const std::string& pattern) {
  std::vector<int> pi = prefix_function(pattern); int matched = 0;
  for (std::size_t i = 0; i < text.size(); ++i) { while (matched && text[i] != pattern[matched]) matched = pi[matched - 1]; if (text[i] == pattern[matched]) ++matched; if (matched == static_cast<int>(pattern.size())) return static_cast<int>(i) - matched + 1; }
  return -1;
}
int main(){return find_pattern("abacaba","aca")==2?0:1;}
`,
  },
  {
    id: 'aho-corasick-matcher',
    split: 'development',
    family: 'string',
    gold: single('string.pattern.ac-automaton'),
    fileName: 'aho_corasick.cpp',
    source: String.raw`#include <array>
#include <queue>
#include <string>
#include <vector>
struct AhoCorasick {
  struct Node { std::array<int,26> next{}; int fail=0, output=0; };
  std::vector<Node> trie{{}};
  void insert(const std::string& word) { int node=0; for(char ch:word){int c=ch-'a'; if(!trie[node].next[c]){trie[node].next[c]=trie.size();trie.push_back({});}node=trie[node].next[c];}++trie[node].output; }
  void build(){std::queue<int> q;for(int c=0;c<26;++c)if(trie[0].next[c])q.push(trie[0].next[c]);while(!q.empty()){int node=q.front();q.pop();for(int c=0;c<26;++c){int child=trie[node].next[c];if(child){trie[child].fail=trie[trie[node].fail].next[c];q.push(child);}else trie[node].next[c]=trie[trie[node].fail].next[c];}}}
  int count(const std::string& text) const {int node=0,total=0;for(char ch:text){node=trie[node].next[ch-'a'];for(int cursor=node;cursor;cursor=trie[cursor].fail)total+=trie[cursor].output;}return total;}
};
int main(){AhoCorasick ac;ac.insert("he");ac.insert("she");ac.build();return ac.count("she")==2?0:1;}
`,
  },
  {
    id: 'zero-one-knapsack-descending',
    split: 'development',
    family: 'dp',
    gold: single('dp.knapsack.01'),
    fileName: '01_knapsack.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
int zero_one_knapsack(const std::vector<int>& weight,const std::vector<int>& value,int capacity){
  std::vector<int> dp(capacity+1);
  for(std::size_t item=0;item<weight.size();++item)
    for(int current=capacity;current>=weight[item];--current)
      dp[current]=std::max(dp[current],dp[current-weight[item]]+value[item]);
  return dp[capacity];
}
int main(){return zero_one_knapsack({2,3},{4,5},3)==5?0:1;}
`,
  },
  {
    id: 'unbounded-knapsack-ascending',
    split: 'development',
    family: 'dp',
    gold: single('dp.knapsack.unbounded'),
    fileName: '完全背包.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
int unbounded_knapsack(const std::vector<int>& weight,const std::vector<int>& value,int capacity){
  std::vector<int> best(capacity+1);
  for(std::size_t item=0;item<weight.size();++item)
    for(int current=weight[item];current<=capacity;++current)
      best[current]=std::max(best[current],best[current-weight[item]]+value[item]);
  return best[capacity];
}
int main(){return unbounded_knapsack({2,3},{4,5},6)==12?0:1;}
`,
  },
  {
    id: 'euler-linear-sieve',
    split: 'development',
    family: 'math',
    gold: single('math.number-theory.prime'),
    fileName: '线性筛.cpp',
    source: String.raw`#include <vector>
std::vector<int> linear_sieve(int limit){
  std::vector<int> primes,least(limit+1);
  for(int value=2;value<=limit;++value){
    if(!least[value]){least[value]=value;primes.push_back(value);}
    for(int prime:primes){if(prime>least[value]||value*prime>limit)break;least[value*prime]=prime;}
  }
  return primes;
}
int main(){return linear_sieve(10)==std::vector<int>({2,3,5,7})?0:1;}
`,
  },
  {
    id: 'int128-decimal-io',
    split: 'development',
    family: 'cpp',
    gold: single('cpp.integer.int128'),
    fileName: '__int128_io.cpp',
    source: String.raw`#include <algorithm>
#include <string>
std::string to_decimal(__int128 value){
  bool negative=value<0;if(negative)value=-value;std::string digits;
  do{digits.push_back(static_cast<char>('0'+value%10));value/=10;}while(value);
  if(negative)digits.push_back('-');std::reverse(digits.begin(),digits.end());return digits;
}
__int128 parse_decimal(const std::string& text){__int128 value=0;for(char digit:text)value=value*10+(digit-'0');return value;}
int main(){return to_decimal(parse_decimal("12345678901234567890"))=="12345678901234567890"?0:1;}
`,
  },
  {
    id: 'fast-buffered-input',
    split: 'development',
    family: 'contest',
    gold: single('contest.io.fast'),
    fileName: 'fast_io.cpp',
    source: String.raw`#include <cstddef>
#include <cstdio>
class FastInput {
  static constexpr std::size_t size=1<<12; char buffer[size]{};std::size_t index=0,length=0;
  char next(){if(index==length){length=std::fread(buffer,1,size,stdin);index=0;if(!length)return 0;}return buffer[index++];}
public:
  int read_int(){char ch;do{ch=next();}while(ch&&ch<=' ');int sign=1,value=0;if(ch=='-'){sign=-1;ch=next();}while(ch>='0'&&ch<='9'){value=value*10+ch-'0';ch=next();}return value*sign;}
};
int main(){FastInput input; (void)input; return 0;}
`,
  },
  {
    id: 'dijkstra-with-disjoint-set',
    split: 'development',
    family: 'composite',
    gold: composite('graph.shortest-path.single-source', 'data-structure.union-find'),
    fileName: '最短路与并查集.cpp',
    source: String.raw`#include <functional>
#include <numeric>
#include <queue>
#include <utility>
#include <vector>
struct DSU{std::vector<int> p;explicit DSU(int n):p(n){std::iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void unite(int a,int b){a=find(a);b=find(b);if(a!=b)p[a]=b;}};
std::vector<int> shortest(const std::vector<std::vector<std::pair<int,int>>>& g){std::vector<int>d(g.size(),1e9);std::priority_queue<std::pair<int,int>,std::vector<std::pair<int,int>>,std::greater<>>q;d[0]=0;q.push({0,0});while(!q.empty()){auto[du,u]=q.top();q.pop();if(du!=d[u])continue;for(auto[v,w]:g[u])if(du+w<d[v]){d[v]=du+w;q.push({d[v],v});}}return d;}
int main(){DSU dsu(2);dsu.unite(0,1);std::vector<std::vector<std::pair<int,int>>>g(2);g[0].push_back({1,2});return dsu.find(0)==dsu.find(1)&&shortest(g)[1]==2?0:1;}
`,
  },
  {
    id: 'dinic-max-flow',
    split: 'development',
    family: 'unknown',
    gold: unknown,
    fileName: 'dinic.cpp',
    source: String.raw`#include <algorithm>
#include <queue>
#include <vector>
struct Dinic{
  struct Edge{int to,reverse,capacity;};int n;std::vector<std::vector<Edge>>g;std::vector<int>level,work;
  explicit Dinic(int n):n(n),g(n),level(n),work(n){}
  void add_edge(int from,int to,int capacity){Edge forward{to,static_cast<int>(g[to].size()),capacity};Edge backward{from,static_cast<int>(g[from].size()),0};g[from].push_back(forward);g[to].push_back(backward);}
  bool bfs(int source,int sink){std::fill(level.begin(),level.end(),-1);std::queue<int>q;level[source]=0;q.push(source);while(!q.empty()){int node=q.front();q.pop();for(const auto&e:g[node])if(e.capacity&&level[e.to]<0){level[e.to]=level[node]+1;q.push(e.to);}}return level[sink]>=0;}
  int dfs(int node,int sink,int flow){if(node==sink)return flow;for(int&i=work[node];i<static_cast<int>(g[node].size());++i){Edge&e=g[node][i];if(e.capacity&&level[e.to]==level[node]+1){int sent=dfs(e.to,sink,std::min(flow,e.capacity));if(sent){e.capacity-=sent;g[e.to][e.reverse].capacity+=sent;return sent;}}}return 0;}
  int max_flow(int source,int sink){int answer=0;while(bfs(source,sink)){std::fill(work.begin(),work.end(),0);while(int sent=dfs(source,sink,1e9))answer+=sent;}return answer;}
};
int main(){Dinic flow(2);flow.add_edge(0,1,7);return flow.max_flow(0,1)==7?0:1;}
`,
  },
  {
    id: 'bellman-ford-edge-relaxation',
    split: 'holdout',
    family: 'graph',
    gold: single('graph.shortest-path.single-source'),
    fileName: 'bellman_ford.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
struct WeightedEdge{int source,target,cost;};
std::vector<int> bellman_ford(int n,const std::vector<WeightedEdge>&edges,int start){std::vector<int>distance(n,1000000000);distance[start]=0;for(int round=1;round<n;++round){bool changed=false;for(const auto&edge:edges)if(distance[edge.source]<1000000000&&distance[edge.source]+edge.cost<distance[edge.target]){distance[edge.target]=distance[edge.source]+edge.cost;changed=true;}if(!changed)break;}return distance;}
int main(){return bellman_ford(3,{{0,1,5},{1,2,-2}},0)[2]==3?0:1;}
`,
  },
  {
    id: 'prim-dense-matrix',
    split: 'holdout',
    family: 'graph',
    gold: single('graph.mst'),
    fileName: 'prim.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
int prim(const std::vector<std::vector<int>>&weight){int n=weight.size(),answer=0;std::vector<int>minimum(n,1000000000);std::vector<bool>used(n);minimum[0]=0;for(int step=0;step<n;++step){int node=-1;for(int candidate=0;candidate<n;++candidate)if(!used[candidate]&&(node<0||minimum[candidate]<minimum[node]))node=candidate;used[node]=true;answer+=minimum[node];for(int next=0;next<n;++next)minimum[next]=std::min(minimum[next],weight[node][next]);}return answer;}
int main(){return prim({{0,2,8},{2,0,3},{8,3,0}})==5?0:1;}
`,
  },
  {
    id: 'sparse-table-range-min',
    split: 'holdout',
    family: 'data-structure',
    gold: single('data-structure.range-query.sparse-table'),
    fileName: 'sparse_table.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
class SparseTable{std::vector<int>log;std::vector<std::vector<int>>table;public:explicit SparseTable(const std::vector<int>&a):log(a.size()+1){for(std::size_t i=2;i<log.size();++i)log[i]=log[i/2]+1;table.assign(log[a.size()]+1,std::vector<int>(a.size()));table[0]=a;for(std::size_t level=1;level<table.size();++level)for(std::size_t i=0;i+(1u<<level)<=a.size();++i)table[level][i]=std::min(table[level-1][i],table[level-1][i+(1u<<(level-1))]);}int query(int left,int right)const{int level=log[right-left+1];return std::min(table[level][left],table[level][right-(1<<level)+1]);}};
int main(){SparseTable st({7,2,9,4});return st.query(1,3)==2?0:1;}
`,
  },
  {
    id: 'union-find-rank-compression',
    split: 'holdout',
    family: 'data-structure',
    gold: single('data-structure.union-find'),
    fileName: 'disjoint_set.cpp',
    source: String.raw`#include <numeric>
#include <vector>
class UnionFind{std::vector<int>parent,rank;public:explicit UnionFind(int n):parent(n),rank(n){std::iota(parent.begin(),parent.end(),0);}int root(int node){if(parent[node]!=node)parent[node]=root(parent[node]);return parent[node];}bool merge(int left,int right){left=root(left);right=root(right);if(left==right)return false;if(rank[left]<rank[right]){int temporary=left;left=right;right=temporary;}parent[right]=left;if(rank[left]==rank[right])++rank[left];return true;}};
int main(){UnionFind sets(3);sets.merge(0,2);return sets.root(0)==sets.root(2)?0:1;}
`,
  },
  {
    id: 'trie-prefix-counter',
    split: 'holdout',
    family: 'string',
    gold: single('string.trie'),
    fileName: 'trie.cpp',
    source: String.raw`#include <array>
#include <string>
#include <vector>
class Trie{struct Node{std::array<int,26>next{};int prefix=0;};std::vector<Node>nodes{{}};public:void insert(const std::string&word){int node=0;for(char ch:word){int c=ch-'a';if(!nodes[node].next[c]){nodes[node].next[c]=nodes.size();nodes.push_back({});}node=nodes[node].next[c];++nodes[node].prefix;}}int count_prefix(const std::string&prefix)const{int node=0;for(char ch:prefix){node=nodes[node].next[ch-'a'];if(!node)return 0;}return nodes[node].prefix;}};
int main(){Trie trie;trie.insert("code");trie.insert("codex");return trie.count_prefix("cod")==2?0:1;}
`,
  },
  {
    id: 'manacher-radius-array',
    split: 'holdout',
    family: 'string',
    gold: single('string.palindrome.manacher'),
    fileName: 'manacher.cpp',
    source: String.raw`#include <algorithm>
#include <string>
#include <vector>
int longest_palindrome(const std::string&text){std::string transformed="^";for(char ch:text){transformed+='#';transformed+=ch;}transformed+="#$";std::vector<int>radius(transformed.size());int center=0,right=0,best=0;for(int i=1;i+1<static_cast<int>(transformed.size());++i){if(i<right)radius[i]=std::min(right-i,radius[2*center-i]);while(transformed[i+radius[i]+1]==transformed[i-radius[i]-1])++radius[i];if(i+radius[i]>right){center=i;right=i+radius[i];}best=std::max(best,radius[i]);}return best;}
int main(){return longest_palindrome("abacaba")==7?0:1;}
`,
  },
  {
    id: 'lis-patience-sorting',
    split: 'holdout',
    family: 'dp',
    gold: single('dp.sequence.lis'),
    fileName: 'lis.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
int lis_length(const std::vector<int>&sequence){std::vector<int>tails;for(int value:sequence){auto position=std::lower_bound(tails.begin(),tails.end(),value);if(position==tails.end())tails.push_back(value);else *position=value;}return tails.size();}
int main(){return lis_length({3,1,2,5,4})==3?0:1;}
`,
  },
  {
    id: 'ntt-polynomial-convolution',
    split: 'holdout',
    family: 'math',
    gold: single('math.polynomial.ntt'),
    fileName: 'ntt.cpp',
    source: String.raw`#include <algorithm>
#include <vector>
constexpr int modulus=998244353,primitive_root=3;
int power_mod(int base,int exponent){long long result=1;while(exponent){if(exponent&1)result=result*base%modulus;base=static_cast<long long>(base)*base%modulus;exponent>>=1;}return result;}
void ntt(std::vector<int>&values,bool invert){for(int i=1,j=0;i<static_cast<int>(values.size());++i){int bit=values.size()>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)std::swap(values[i],values[j]);}for(int length=2;length<=static_cast<int>(values.size());length<<=1){int root=power_mod(primitive_root,(modulus-1)/length);if(invert)root=power_mod(root,modulus-2);for(int start=0;start<static_cast<int>(values.size());start+=length){long long factor=1;for(int offset=0;offset<length/2;++offset){int even=values[start+offset],odd=factor*values[start+offset+length/2]%modulus;values[start+offset]=(even+odd)%modulus;values[start+offset+length/2]=(even-odd+modulus)%modulus;factor=factor*root%modulus;}}}if(invert){int inverse=power_mod(values.size(),modulus-2);for(int&value:values)value=static_cast<long long>(value)*inverse%modulus;}}
int main(){std::vector<int>a{1,2,0,0},b{3,4,0,0};ntt(a,false);ntt(b,false);for(int i=0;i<4;++i)a[i]=static_cast<long long>(a[i])*b[i]%modulus;ntt(a,true);return a[0]==3&&a[1]==10&&a[2]==8?0:1;}
`,
  },
  {
    id: 'gregorian-day-number',
    split: 'holdout',
    family: 'datetime',
    gold: single('datetime.calendar.convert'),
    fileName: '日期转序号.cpp',
    source: String.raw`bool leap_year(int year){return year%400==0||(year%4==0&&year%100!=0);}long long day_number(int year,int month,int day){static const int days_before_month[]={0,0,31,59,90,120,151,181,212,243,273,304,334};long long previous=year-1;long long result=previous*365+previous/4-previous/100+previous/400;result+=days_before_month[month]+day;if(month>2&&leap_year(year))++result;return result;}
int main(){return day_number(2024,3,1)-day_number(2024,2,28)==2?0:1;}
`,
  },
  {
    id: 'kmp-with-fenwick',
    split: 'holdout',
    family: 'composite',
    gold: composite('string.pattern.kmp', 'data-structure.fenwick'),
    fileName: '匹配位置动态统计.cpp',
    source: String.raw`#include <string>
#include <vector>
std::vector<int>prefix(const std::string&p){std::vector<int>pi(p.size());for(std::size_t i=1;i<p.size();++i){int j=pi[i-1];while(j&&p[i]!=p[j])j=pi[j-1];if(p[i]==p[j])++j;pi[i]=j;}return pi;}
struct FenwickCounter{std::vector<int>tree;explicit FenwickCounter(int n):tree(n+1){}void add(int index){for(++index;index<static_cast<int>(tree.size());index+=index&-index)++tree[index];}int prefix_count(int index)const{int answer=0;for(++index;index>0;index-=index&-index)answer+=tree[index];return answer;}};
int main(){std::string text="aaaa",pattern="aa";auto pi=prefix(pattern);FenwickCounter hits(text.size());int matched=0;for(int i=0;i<static_cast<int>(text.size());++i){while(matched&&text[i]!=pattern[matched])matched=pi[matched-1];if(text[i]==pattern[matched])++matched;if(matched==static_cast<int>(pattern.size())){hits.add(i-matched+1);matched=pi[matched-1];}}return hits.prefix_count(3)==3?0:1;}
`,
  },
  {
    id: 'suffix-automaton-distinct-substrings',
    split: 'holdout',
    family: 'unknown',
    gold: unknown,
    fileName: 'suffix_automaton.cpp',
    source: String.raw`#include <array>
#include <string>
#include <vector>
class SuffixAutomaton{struct State{int length=0,link=-1;std::array<int,26>next{};};std::vector<State>states{{}};int last=0;public:void extend(char ch){int current=states.size();states.push_back({states[last].length+1,-1,{}});int p=last,c=ch-'a';while(p>=0&&!states[p].next[c]){states[p].next[c]=current;p=states[p].link;}if(p<0)states[current].link=0;else{int q=states[p].next[c];if(states[p].length+1==states[q].length)states[current].link=q;else{int clone=states.size();states.push_back(states[q]);states[clone].length=states[p].length+1;while(p>=0&&states[p].next[c]==q){states[p].next[c]=clone;p=states[p].link;}states[q].link=states[current].link=clone;}}last=current;}long long distinct()const{long long answer=0;for(std::size_t i=1;i<states.size();++i)answer+=states[i].length-states[states[i].link].length;return answer;}};
int main(){SuffixAutomaton automaton;for(char ch:std::string("ababa"))automaton.extend(ch);return automaton.distinct()==9?0:1;}
`,
  },
]

const misleadingNames = [
  '线段树.cpp',
  '贪心.cpp',
  'KMP.cpp',
  '日期计算.cpp',
  '并查集.cpp',
  '二分答案.cpp',
]

const sha256 = content => createHash('sha256').update(content, 'utf8').digest('hex')

const longEnvelope = source => {
  const before = Array.from(
    { length: 90 },
    (_, index) => `constexpr int prefix_noise_${index}() { return ${index}; }`,
  ).join('\n')
  const after = Array.from(
    { length: 90 },
    (_, index) => `constexpr int suffix_noise_${index}() { return ${index + 100}; }`,
  ).join('\n')
  return `// Long-file stress case: the classifying implementation is intentionally in the middle.\n${before}\n${source}\n${after}\n`
}

const variantsFor = (base, baseIndex) => {
  const canonicalId = `${base.id}-canonical`
  const common = {
    baseImplementationId: base.id,
    family: base.family,
    gold: base.gold,
    split: base.split,
  }
  const batchForVariant = variant => `${base.split}-${variant}`
  const fourthVariant = baseIndex % 3 === 0 ? 'long-middle' : 'misleading-comment'
  return [
    {
      ...common,
      batchId: batchForVariant('canonical'),
      fileName: base.fileName,
      pairedSampleId: null,
      sampleId: canonicalId,
      source: base.source,
      variant: 'canonical',
    },
    {
      ...common,
      batchId: batchForVariant('renamed'),
      fileName: `snippet_${String(baseIndex + 1).padStart(2, '0')}.cpp`,
      pairedSampleId: canonicalId,
      sampleId: `${base.id}-renamed`,
      source: `// Neutral opaque name; classify from source.\n${base.source}`,
      variant: 'renamed',
    },
    {
      ...common,
      batchId: batchForVariant('misleading-name'),
      fileName: misleadingNames[baseIndex % misleadingNames.length],
      pairedSampleId: canonicalId,
      sampleId: `${base.id}-misleading-name`,
      source: `// The filename is an adversarial distractor.\n${base.source}`,
      variant: 'misleading-name',
    },
    {
      ...common,
      batchId: batchForVariant(fourthVariant),
      fileName: base.fileName,
      pairedSampleId: canonicalId,
      sampleId: `${base.id}-${fourthVariant}`,
      source:
        fourthVariant === 'long-middle'
          ? longEnvelope(base.source)
          : `// Misleading note: this file is a generic greedy sorting template.\n${base.source}`,
      variant: fourthVariant,
    },
    {
      ...common,
      batchId: batchForVariant('batch-repeat'),
      fileName: base.fileName,
      pairedSampleId: canonicalId,
      sampleId: `${base.id}-batch-repeat`,
      source: base.source,
      variant: 'batch-repeat',
    },
  ]
}

await rm(fixtureRoot, { force: true, recursive: true })
await mkdir(sourceRoot, { recursive: true })

const samples = []
for (const [baseIndex, base] of bases.entries()) {
  for (const variant of variantsFor(base, baseIndex)) {
    const sourcePath = `sources/${variant.sampleId}.cpp`
    await writeFile(resolve(fixtureRoot, sourcePath), variant.source, 'utf8')
    const { source, ...sample } = variant
    samples.push({ ...sample, sourcePath, sourceSha256: sha256(source) })
  }
}

const familyForCategory = categoryId => {
  if (categoryId.startsWith('data-structure')) return 'data-structure'
  return categoryId.split('.')[0]
}

const manifest = {
  baseImplementationCount: bases.length,
  categories: categories.map(categoryId => ({ categoryId, family: familyForCategory(categoryId) })),
  createdAt: '2026-09-14T00:00:00.000Z',
  datasetId: 'classification-evaluation-provisional-v1',
  description:
    'Synthetic C++ classification regression corpus. Labels are provisional AI drafts and have not received human expert sign-off.',
  labelStatus: 'provisional-ai-drafted-unreviewed',
  sampleCount: samples.length,
  samples,
  schemaVersion: 1,
  taxonomyVersion: 2,
}

await writeFile(
  resolve(fixtureRoot, 'manifest.json'),
  await format(JSON.stringify(manifest), { parser: 'json', printWidth: 100 }),
  'utf8',
)

const baseCounts = Object.groupBy(bases, base => base.split)
console.log(
  JSON.stringify(
    {
      baseImplementationCount: bases.length,
      developmentBaseCount: baseCounts.development?.length ?? 0,
      holdoutBaseCount: baseCounts.holdout?.length ?? 0,
      sampleCount: samples.length,
    },
    null,
    2,
  ),
)
