// Misleading note: this file is a generic greedy sorting template.
#include <functional>
#include <numeric>
#include <queue>
#include <utility>
#include <vector>
struct DSU{std::vector<int> p;explicit DSU(int n):p(n){std::iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void unite(int a,int b){a=find(a);b=find(b);if(a!=b)p[a]=b;}};
std::vector<int> shortest(const std::vector<std::vector<std::pair<int,int>>>& g){std::vector<int>d(g.size(),1e9);std::priority_queue<std::pair<int,int>,std::vector<std::pair<int,int>>,std::greater<>>q;d[0]=0;q.push({0,0});while(!q.empty()){auto[du,u]=q.top();q.pop();if(du!=d[u])continue;for(auto[v,w]:g[u])if(du+w<d[v]){d[v]=du+w;q.push({d[v],v});}}return d;}
int main(){DSU dsu(2);dsu.unite(0,1);std::vector<std::vector<std::pair<int,int>>>g(2);g[0].push_back({1,2});return dsu.find(0)==dsu.find(1)&&shortest(g)[1]==2?0:1;}
