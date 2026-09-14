// The filename is an adversarial distractor.
#include <algorithm>
#include <vector>
int prim(const std::vector<std::vector<int>>&weight){int n=weight.size(),answer=0;std::vector<int>minimum(n,1000000000);std::vector<bool>used(n);minimum[0]=0;for(int step=0;step<n;++step){int node=-1;for(int candidate=0;candidate<n;++candidate)if(!used[candidate]&&(node<0||minimum[candidate]<minimum[node]))node=candidate;used[node]=true;answer+=minimum[node];for(int next=0;next<n;++next)minimum[next]=std::min(minimum[next],weight[node][next]);}return answer;}
int main(){return prim({{0,2,8},{2,0,3},{8,3,0}})==5?0:1;}
