#include <algorithm>
#include <vector>
class SparseTable{std::vector<int>log;std::vector<std::vector<int>>table;public:explicit SparseTable(const std::vector<int>&a):log(a.size()+1){for(std::size_t i=2;i<log.size();++i)log[i]=log[i/2]+1;table.assign(log[a.size()]+1,std::vector<int>(a.size()));table[0]=a;for(std::size_t level=1;level<table.size();++level)for(std::size_t i=0;i+(1u<<level)<=a.size();++i)table[level][i]=std::min(table[level-1][i],table[level-1][i+(1u<<(level-1))]);}int query(int left,int right)const{int level=log[right-left+1];return std::min(table[level][left],table[level][right-(1<<level)+1]);}};
int main(){SparseTable st({7,2,9,4});return st.query(1,3)==2?0:1;}
