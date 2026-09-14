// Neutral opaque name; classify from source.
#include <vector>
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
