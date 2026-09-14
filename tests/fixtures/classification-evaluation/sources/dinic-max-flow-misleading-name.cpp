// The filename is an adversarial distractor.
#include <algorithm>
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
