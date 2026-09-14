// Neutral opaque name; classify from source.
#include <algorithm>
#include <vector>
int zero_one_knapsack(const std::vector<int>& weight,const std::vector<int>& value,int capacity){
  std::vector<int> dp(capacity+1);
  for(std::size_t item=0;item<weight.size();++item)
    for(int current=capacity;current>=weight[item];--current)
      dp[current]=std::max(dp[current],dp[current-weight[item]]+value[item]);
  return dp[capacity];
}
int main(){return zero_one_knapsack({2,3},{4,5},3)==5?0:1;}
