// The filename is an adversarial distractor.
#include <algorithm>
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
