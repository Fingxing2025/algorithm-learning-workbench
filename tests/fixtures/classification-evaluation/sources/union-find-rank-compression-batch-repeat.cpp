#include <numeric>
#include <vector>
class UnionFind{std::vector<int>parent,rank;public:explicit UnionFind(int n):parent(n),rank(n){std::iota(parent.begin(),parent.end(),0);}int root(int node){if(parent[node]!=node)parent[node]=root(parent[node]);return parent[node];}bool merge(int left,int right){left=root(left);right=root(right);if(left==right)return false;if(rank[left]<rank[right]){int temporary=left;left=right;right=temporary;}parent[right]=left;if(rank[left]==rank[right])++rank[left];return true;}};
int main(){UnionFind sets(3);sets.merge(0,2);return sets.root(0)==sets.root(2)?0:1;}
