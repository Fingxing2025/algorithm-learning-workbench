// Misleading note: this file is a generic greedy sorting template.
#include <algorithm>
#include <vector>
int unbounded_knapsack(const std::vector<int>& weight,const std::vector<int>& value,int capacity){
  std::vector<int> best(capacity+1);
  for(std::size_t item=0;item<weight.size();++item)
    for(int current=weight[item];current<=capacity;++current)
      best[current]=std::max(best[current],best[current-weight[item]]+value[item]);
  return best[capacity];
}
int main(){return unbounded_knapsack({2,3},{4,5},6)==12?0:1;}
