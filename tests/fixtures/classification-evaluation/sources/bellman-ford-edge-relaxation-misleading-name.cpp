// The filename is an adversarial distractor.
#include <algorithm>
#include <vector>
struct WeightedEdge{int source,target,cost;};
std::vector<int> bellman_ford(int n,const std::vector<WeightedEdge>&edges,int start){std::vector<int>distance(n,1000000000);distance[start]=0;for(int round=1;round<n;++round){bool changed=false;for(const auto&edge:edges)if(distance[edge.source]<1000000000&&distance[edge.source]+edge.cost<distance[edge.target]){distance[edge.target]=distance[edge.source]+edge.cost;changed=true;}if(!changed)break;}return distance;}
int main(){return bellman_ford(3,{{0,1,5},{1,2,-2}},0)[2]==3?0:1;}
