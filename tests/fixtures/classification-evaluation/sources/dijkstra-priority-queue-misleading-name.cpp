// The filename is an adversarial distractor.
#include <functional>
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
